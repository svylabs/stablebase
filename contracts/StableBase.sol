import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./library/Math.sol";
import "./interfaces/IPriceOracle.sol";
import "./Structures.sol";
import "./interfaces/IDoublyLinkedList.sol";
import "./SBDToken.sol";
import "./Utilities.sol";
import "./interfaces/IStableBase.sol";
import "./interfaces/IReservePool.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract StableBase is IStableBase, ERC721 {
    uint256 internal originationFeeRateBasisPoints = 0; // start with 0% origination fee
    uint256 internal liquidationRatio = 110; // 110% liquidation ratio
    uint256 internal constant BASIS_POINTS_DIVISOR = 10000;

    IDoublyLinkedList public shieldedSafes;
    IDoublyLinkedList public orderedReserveRatios;
    IDoublyLinkedList public orderedTargetShieldedRates;

    // Mapping to track Safe balances
    // mapping(bytes32 => SBStructs.Safe) public safes;
    mapping(uint256 => SBStructs.Safe) public safes;

    SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

    mapping(address => SBStructs.WhitelistedToken) public whitelistedTokens;

    SBDToken public sbdToken;

    // address public owner;

    mapping(address => uint256) public shieldingRates;

    address public reservePool;

    Math.Rate public referenceShieldingRate = Math.Rate(0, 0);

    constructor(address _sbdToken) ERC721("NFTSafe", "NFTS") {
        sbdToken = SBDToken(_sbdToken);
    }

    function updateTargetShieldingRate(
        uint256 _safeId,
        uint256 compressedRate,
        IReservePool _reservePool,
        bytes calldata borrowParams
    ) internal {
        SBStructs.Safe storage safe = safes[_safeId];
        require(
            ownerOf(_safeId) == msg.sender,
            "Only the NFT owner can update"
        );
        uint256 _targetShieldingRate = SBUtils.getRateAtPosition(
            compressedRate,
            1
        );
        IDoublyLinkedList _orderedTargetShieldedRates = IDoublyLinkedList(
            orderedTargetShieldedRates
        );
        uint256 _nearestSpotInTargetShieldingRate = uint256(
            bytes32(borrowParams[36:68])
        );
        _orderedTargetShieldedRates.upsert(
            _safeId,
            _targetShieldingRate,
            _nearestSpotInTargetShieldingRate
        );

        Math.Rate memory _target = referenceShieldingRate;
        referenceShieldingRate = Math.add(
            _target,
            _targetShieldingRate,
            _reservePool.getStake(_safeId)
        );
    }

    function handleBorrowReserveRatioSafes(
        uint256 _safeId,
        SBStructs.Safe memory safe,
        uint256 compressedRate,
        uint256 amount,
        bytes calldata borrowParams
    ) internal returns (SBStructs.Safe memory) {
        // SBStructs.Safe storage currentSafe = safes[_safeId];
        // require(msg.sender == currentSafe.owner, "Only the safe owner can borrow");
        // Calculate origination fee
        uint256 _reserveRatio = SBUtils.getRateAtPosition(compressedRate, 0);
        uint256 _reservePoolDeposit = (amount * _reserveRatio) /
            BASIS_POINTS_DIVISOR;
        uint _amountToBorrow = amount - _reservePoolDeposit;
        safe.borrowedAmount += amount;
        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amountToBorrow);
        IDoublyLinkedList _orderedReserveRatios = IDoublyLinkedList(
            orderedReserveRatios
        );
        uint256 _nearestSpot = uint256(bytes32(borrowParams[4:32]));
        // TODO: Mint to reserve pool
        sbdToken.mint(reservePool, _reservePoolDeposit);
        IReservePool _reservePool = IReservePool(reservePool);
        _reservePool.addStake(_safeId, _reservePoolDeposit);
        uint _newReserveRatio = ((_reservePool.getStake(_safeId) *
            BASIS_POINTS_DIVISOR) / safe.borrowedAmount);
        _orderedReserveRatios.upsert(_safeId, _newReserveRatio, _nearestSpot);

        updateTargetShieldingRate(
            _safeId,
            compressedRate,
            _reservePool,
            borrowParams
        );
        return safe;
    }

    function _getShieldingTime(
        uint256 _shieldingRate,
        uint256 startTime
    ) internal view returns (uint256) {
        uint256 _shieldingHours = 0;
        if (Math.isZero(referenceShieldingRate)) {
            // Every 24 hours
            _shieldingHours = Math.HOURS_IN_DAY;
        } else {
            _shieldingHours = Math.getShieldingHours(
                referenceShieldingRate,
                _shieldingRate
            );
        }
        return startTime + Math.toSeconds(_shieldingHours);
    }

    function handleBorrowShieldedSafes(
        uint256 _safeId,
        SBStructs.Safe memory safe,
        uint256 compressedRate,
        uint256 amount,
        bytes calldata borrowParams
    ) internal returns (SBStructs.Safe memory) {
        // SBStructs.Safe storage currentSafe = safes[_safeId];
        require(
            ownerOf(_safeId) == msg.sender,
            "Only the NFT owner can borrow"
        );
        uint256 _shieldingRate = SBUtils.getRateAtPosition(compressedRate, 0);
        uint256 _shieldingFee = (amount * _shieldingRate) /
            BASIS_POINTS_DIVISOR;
        uint _amountToBorrow = amount - _shieldingFee;
        // Update the Safe's shieldedUntil timestamp
        safe.shieldedUntil = _getShieldingTime(_shieldingRate, block.timestamp);
        safe.borrowedAmount += amount;

        uint256 _nearestSpot = uint256(bytes32(borrowParams[4:36]));
        IDoublyLinkedList _shieldedSafes = IDoublyLinkedList(shieldedSafes);

        // TODO: shieldedUntil needs to dynamically change based on the borrowings
        _shieldedSafes.upsert(_safeId, safe.shieldedUntil, _nearestSpot);

        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amountToBorrow);
        // TODO: mint fee

        return safe;
    }

    // function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
    //     // Check if the safe is being transferred
    //     if (from != address(0) && to != address(0)) {
    //         bytes32 _safeId = bytes32(tokenId);
    //         SBStructs.Safe storage safe = safes[_safeId];
    //         require(from == safe.owner, "Only the safe owner can transfer");
    //         safe.owner = to;
    //     }
    // }

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
            // bytes32 _safeId = bytes32(currentShieldedSafe);
            uint256 _safeId = currentShieldedSafe;
            SBStructs.Safe memory safe = safes[_safeId];
            if (safe.shieldedUntil <= block.timestamp) {
                uint256 redeemableAmount = safe.borrowedAmount;
                if (redeemableAmount > 0) {
                    uint256 toRedeem = (requestedAmount - totalRedeemed) <=
                        redeemableAmount
                        ? (requestedAmount - totalRedeemed)
                        : redeemableAmount;
                    (safe, redemption) = redeemSafe(
                        _safeId,
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
        if (headNode.value > tailNode.value) {
            return headNode.value - tailNode.value;
        } else {
            return tailNode.value - headNode.value;
        }
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

    function shouldRedeemByTargetShieldingRate(
        uint256 head,
        uint256 tail,
        IDoublyLinkedList targetShieldingRateList
    ) internal returns (uint256) {
        IDoublyLinkedList.Node memory headNode = targetShieldingRateList.get(
            head
        );
        IDoublyLinkedList.Node memory tailNode = targetShieldingRateList.get(
            tail
        );
        if (_diffBetween(headNode, tailNode) < 100) {
            // Cannot redeem anymore
            return 0;
        }
        uint256 diffHeadWithTarget = _diffBetween(
            headNode,
            referenceShieldingRate
        );
        uint256 diffTailWithTarget = _diffBetween(
            tailNode,
            referenceShieldingRate
        );
        if (diffHeadWithTarget > diffTailWithTarget) {
            return 1; // redeem head
        } else if (diffHeadWithTarget < diffTailWithTarget) {
            return 2; // redeem tail
        } else {
            return 0; // cannot redeem
        }
    }

    function _redeemSafesByTargetShieldingRate(
        SBStructs.Redemption memory redemption,
        bytes calldata _redemptionParams,
        IDoublyLinkedList reserveRatioList,
        IDoublyLinkedList targetShieldingRateList
    ) internal returns (SBStructs.Redemption memory) {
        uint256 head = targetShieldingRateList.getHead();
        uint256 tail = targetShieldingRateList.getTail();
        SBStructs.Safe memory safe;
        uint256 processedSpots = redemption.processedSpots;
        // Target within 1% = 100 points, 100% = 10000 points
        while (redemption.redeemedAmount < redemption.requestedAmount) {
            uint256 spotForUpdate = uint256(
                bytes32(
                    _redemptionParams[processedSpots * 32:processedSpots *
                        32 +
                        32]
                )
            );
            uint256 redeemTarget = shouldRedeemByTargetShieldingRate(
                head,
                tail,
                targetShieldingRateList
            );
            // 0 = cannot redeem, 1 = redeem head, 2 = redeem tail
            if (redeemTarget == 1) {
                // TODO: redeem head
                (safe, redemption) = _redeemNode(
                    head,
                    redemption,
                    reserveRatioList,
                    targetShieldingRateList,
                    spotForUpdate
                );
            } else if (redeemTarget == 2) {
                // TODO: redeem tail
                (safe, redemption) = _redeemNode(
                    tail,
                    redemption,
                    reserveRatioList,
                    targetShieldingRateList,
                    spotForUpdate
                );
            } else {
                break;
            }
            processedSpots++;
        }
        redemption.processedSpots = processedSpots;
        return redemption;
    }

    function removeFromReserveRatioListAndAdjustReferenceRate(
        uint256 _safeId,
        IDoublyLinkedList reserveRatioList
    ) internal {
        // remove stake from reserve pool
        // TODO: Returns the stake back to the user address
        (, uint256 currentStake) = IReservePool(reservePool).removeStake(
            _safeId
        );
        IDoublyLinkedList.Node memory node = reserveRatioList.remove(_safeId);
        Math.Rate memory _target = referenceShieldingRate;
        referenceShieldingRate = Math.subtract(
            _target,
            node.value,
            currentStake
        );
        reserveRatioList.remove(_safeId);
    }

    function _redeemNode(
        uint256 _safeId,
        SBStructs.Redemption memory redemption,
        IDoublyLinkedList reserveRatioList,
        IDoublyLinkedList targetShieldingRateList,
        uint256 spotForUpdate
    ) internal returns (SBStructs.Safe memory, SBStructs.Redemption memory) {
        // bytes32 _safeId = bytes32(_safeId);
        SBStructs.Safe memory safe = safes[_safeId];
        uint256 amountToRedeem = redemption.requestedAmount -
            redemption.redeemedAmount;
        if (amountToRedeem > safe.borrowedAmount) {
            amountToRedeem = safe.borrowedAmount;
        }
        if (amountToRedeem == safe.borrowedAmount) {
            // If the safe was fully redeemed, remove it from both the lists
            targetShieldingRateList.remove(_safeId);
            removeFromReserveRatioListAndAdjustReferenceRate(
                _safeId,
                reserveRatioList
            );
        } else {
            IReservePool _reservePool = IReservePool(reservePool);
            uint256 stake = _reservePool.getStake(_safeId);
            // Find an appropriate spot to insert the safe after updating the reserve ratio
            uint256 _newReserveRatio = (stake * BASIS_POINTS_DIVISOR) /
                (safe.borrowedAmount - amountToRedeem);
            reserveRatioList.upsert(_safeId, _newReserveRatio, spotForUpdate);
        }
        // update target shielding rate
        return redeemSafe(_safeId, amountToRedeem, safe, redemption);
    }

    function _redeemSafesByReserveRatio(
        SBStructs.Redemption memory redemption,
        bytes calldata redemptionParams,
        IDoublyLinkedList reserveRatioList,
        IDoublyLinkedList targetShieldingRateList
    ) internal returns (SBStructs.Redemption memory) {
        uint256 processedSpots = redemption.processedSpots;
        // Target within 1% = 100 points, 100% = 10000 points
        while (redemption.redeemedAmount < redemption.requestedAmount) {
            /*uint256 spotForUpdate = uint256(
                bytes32(
                    redemptionParams[processedSpots * 32:processedSpots *
                        32 +
                        32]
                )
            );*/
            uint256 spotForUpdate = 0;
            uint256 head = reserveRatioList.getHead();
            (, redemption) = _redeemNode(
                head,
                redemption,
                reserveRatioList,
                targetShieldingRateList,
                spotForUpdate
            );
            processedSpots++;
        }
        redemption.processedSpots = processedSpots;
        return redemption;
    }

    function _redeemSafesNonExpired(
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Redemption memory) {
        return redemption;
    }

    // Utility function to get collateral value
    function _getCollateralPrice(
        SBStructs.Safe memory safe
    ) internal view returns (uint256) {
        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[safe.token].priceOracle
        );
        return priceOracle.getPrice();
    }

    function _redeemToUser(SBStructs.Redemption memory redemption) internal {
        for (uint256 i = 0; i < redemption.tokensList.length; i++) {
            SBStructs.RedemptionToken memory token = redemption.tokensList[i];
            SBUtils.withdrawEthOrToken(token.token, msg.sender, token.amount);
        }
    }

    function redeemSafe(
        uint256 _safeId,
        uint256 amountToRedeem,
        SBStructs.Safe memory safe,
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Safe memory, SBStructs.Redemption memory) {
        //uint256 amountInCollateral = amountToRedeem /
        uint256 amountInCollateral = amountToRedeem / _getCollateralPrice(safe);
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
        safes[_safeId] = safe;
        return (safe, redemption);
    }
}
