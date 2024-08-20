import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./library/Math.sol";
import "./interfaces/IPriceOracle.sol";
import "./Structures.sol";
import "./interfaces/IDoublyLinkedList.sol";
import "./SBDToken.sol";
import "./Utilities.sol";

abstract contract StableBase {
    uint256 internal originationFeeRateBasisPoints = 0; // start with 0% origination fee
    uint256 internal liquidationRatio = 110; // 110% liquidation ratio
    uint256 internal constant BASIS_POINTS_DIVISOR = 10000;

    IDoublyLinkedList public shieldedSafes;
    IDoublyLinkedList public orderedReserveRatios;
    IDoublyLinkedList public orderedTargetShieldedRates;

    // Mapping to track Safe balances
    mapping(bytes32 => SBStructs.Safe) public safes;

    SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

    mapping(address => SBStructs.WhitelistedToken) public whitelistedTokens;

    SBDToken public sbdToken;

    address public owner;

    mapping(address => uint256) public shieldingRates;

    // address public orderedReserveRatios;
    // address public orderedTargetShieldedRates;
    // address public shieldedSafes;

    address public reservePool;

    Math.Rate public referenceShieldingRate = Math.Rate(0, 0);

    /**
     * 1. Redeem expired safes
     * 2. Redeem safes based on target shielding rate
     * 3. Redeem safes based on reserve ratio
     */

    function _redeemExpiredSafes(
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Redemption memory) {
        uint256 totalRedeemed = redemption.redeemedAmount;
        uint256 requestedAmount = redemption.requestedAmount;
        IDoublyLinkedList _shieldedSafe = IDoublyLinkedList(shieldedSafes);
        uint256 currentShieldedSafe = _shieldedSafe.getHead();
        while (currentShieldedSafe != 0 && totalRedeemed < requestedAmount) {
            bytes32 safeId = bytes32(currentShieldedSafe);
            SBStructs.Safe memory safe = safes[safeId];
            if (safe.shieldedUntil <= block.timestamp) {
                uint256 redeemableAmount = safe.borrowedAmount;
                if (redeemableAmount > 0) {
                    uint256 toRedeem = (requestedAmount - totalRedeemed) <=
                        redeemableAmount
                        ? (requestedAmount - totalRedeemed)
                        : redeemableAmount;
                    (safe, redemption) = redeemSafe(
                        safeId,
                        toRedeem,
                        safe,
                        redemption
                    );
                    totalRedeemed += toRedeem;
                    if (toRedeem == redeemableAmount) {
                        IDoublyLinkedList(shieldedSafes).remove(
                            uint(currentShieldedSafe)
                        );
                    }
                }
                currentShieldedSafe = _shieldedSafe.getHead();
            } else {
                break;
            }
        }
        return redemption;
    }

    function _diffBetween(
        IDoublyLinkedList.Node memory headNode,
        IDoublyLinkedList.Node memory tailNode
    ) internal pure returns (uint256) {
        return headNode.value - tailNode.value;
    }

    function _diffBetween(
        IDoublyLinkedList.Node memory node,
        Math.Rate memory _refShieldingRate
    ) internal returns (uint256) {
        uint256 refRate = Math.calculateRate(_refShieldingRate);
        if (node.value > refRate) {
            return node.value - refRate;
        } else {
            return refRate - node.value;
        }
    }

    function _redeemSafesByTargetShieldingRate(
        SBStructs.Redemption memory redemption,
        bytes calldata _redemptionParams
    ) internal returns (SBStructs.Redemption memory) {
        IDoublyLinkedList dll = IDoublyLinkedList(orderedReserveRatios);
        uint256 head = dll.getHead();
        uint256 tail = dll.getTail();
        IDoublyLinkedList.Node memory headNode = dll.get(head);
        IDoublyLinkedList.Node memory tailNode = dll.get(tail);
        while (_diffBetween(headNode, tailNode) > 100) {
            uint256 diffHeadWithTarget = _diffBetween(
                headNode,
                referenceShieldingRate
            );
            uint256 diffTailWithTarget = _diffBetween(
                tailNode,
                referenceShieldingRate
            );
            if (diffHeadWithTarget > diffTailWithTarget) {
                // TODO: redeem head
                SBStructs.Safe memory safe;
                (safe, redemption) = _redeemNode(head, headNode, redemption);
            } else {
                // TODO: redeem tail
            }
        }
        return redemption;
    }

    function _redeemNode(
        uint256 id,
        IDoublyLinkedList.Node memory node,
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Safe memory, SBStructs.Redemption memory) {
        bytes32 safeId = bytes32(id);
        SBStructs.Safe memory safe = safes[safeId];
        uint256 amountToRedeem = redemption.requestedAmount -
            redemption.redeemedAmount;
        if (amountToRedeem > safe.borrowedAmount) {
            amountToRedeem = safe.borrowedAmount;
        }
        return redeemSafe(safeId, amountToRedeem, safe, redemption);
    }

    function _redeemSafesByReserveRatio(
        SBStructs.Redemption memory redemption,
        bytes calldata redemptionParams
    ) internal returns (SBStructs.Redemption memory) {
        return redemption;
    }

    function _redeemSafesNonExpired(
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Redemption memory) {
        return redemption;
    }

    // Utility function to get collateral value
    function _getCollateralValue(
        SBStructs.Safe memory safe
    ) internal view returns (uint256) {
        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[safe.token].priceOracle
        );
        uint256 price = priceOracle.getPrice();
        return price * safe.depositedAmount;
    }

    function _redeemToUser(SBStructs.Redemption memory redemption) internal {
        for (uint256 i = 0; i < redemption.tokensList.length; i++) {
            SBStructs.RedemptionToken memory token = redemption.tokensList[i];
            SBUtils.withdrawEthOrToken(token.token, msg.sender, token.amount);
        }
    }

    function redeemSafe(
        bytes32 safeId,
        uint256 amountToRedeem,
        SBStructs.Safe memory safe,
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Safe memory, SBStructs.Redemption memory) {
        uint256 amountInCollateral = amountToRedeem / _getCollateralValue(safe);
        safe.depositedAmount -= amountInCollateral;
        bool found = false;
        for (uint256 i = 0; i < redemption.tokensCount; i++) {
            if (redemption.tokensList[i].token == safe.token) {
                redemption.tokensList[i].amount += amountInCollateral;
                found = true;
            }
        }
        if (!found) {
            redemption.tokensList[redemption.tokensCount] = SBStructs
                .RedemptionToken({
                    token: safe.token,
                    amount: amountInCollateral
                });
            redemption.tokensCount++;
        }
        safe.borrowedAmount -= amountToRedeem;
        if (safe.borrowedAmount == 0) {
            // TODO: SEE WHAT TO DO WITH THE SAFE
        }
        redemption.redeemedAmount += amountToRedeem;
        safes[safeId] = safe;
        return (safe, redemption);
    }
}
