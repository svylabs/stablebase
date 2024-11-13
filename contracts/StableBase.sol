pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPriceOracle.sol";
import "./Structures.sol";
import "./interfaces/IDoublyLinkedList.sol";
import "./interfaces/IStableBase.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ISBRStaking.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMintableToken is IERC20 {
    function mint(address to, uint256 amount) external returns (bool);

    function burn(address from, uint256 amount) external returns (bool);
}

abstract contract StableBase is IStableBase, ERC721URIStorage, Ownable {
    uint256 internal liquidationRatio = 11000; // 110% liquidation ratio
    uint256 internal constant BASIS_POINTS_DIVISOR = 10000;
    uint256
        internal constant FIRST_TIME_BORROW_BASIS_POINTS_DISCOUNT_THRESHOLD =
        20;
    uint256 public constant MINIMUM_DEBT = 2000 * 10 ** 18;
    uint256 internal constant PRECISION = 10 ** 18;

    IDoublyLinkedList public safesOrderedForLiquidation;

    IDoublyLinkedList public safesOrderedForRedemption;

    // Mapping to track Safe balances
    // mapping(bytes32 => Safe) public safes;
    mapping(uint256 => Safe) public safes;

    SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

    IMintableToken public sbdToken;

    IPriceOracle public priceOracle;

    IStabilityPool public stabilityPool;

    ISBRStaking public sbrTokenStaking;

    uint256 public constant SBR_FEE_REWARD = 1000; // 10% of the fee goes to SBR Stakers

    uint256 public constant REDEMPTION_LIQUIDATION_FEE = 75; // 0.75%;

    uint256 public constant REDEMPTION_BASE_FEE = 15; // 0.15%;

    uint256 public cumulativeDebtPerUnitCollateral;

    uint256 public cumulativeCollateralPerUnitCollateral;

    uint256 public totalCollateral;

    uint256 public totalDebt;

    SBStructs.Mode public PROTOCOL_MODE = SBStructs.Mode.BOOTSTRAP;
    uint256 public constant BOOTSTRAP_MODE_DEBT_THRESHOLD = 5000000 * 10 ** 18; // 5 million SBD

    struct LiquidationSnapshot {
        uint256 collateralPerCollateralSnapshot;
        uint256 debtPerCollateralSnapshot;
    }

    mapping(uint256 => LiquidationSnapshot) public liquidationSnapshots;

    bool public stabilityPoolCanReceiveRewards = false;

    bool public sbrStakingPoolCanReceiveRewards = false;

    constructor() Ownable(msg.sender) ERC721("StableBase Safe", "SBSafe") {}

    function setAddresses(
        address _sbdToken,
        address _priceOracle,
        address _stabilityPool,
        address _sbrTokenStaking,
        address _safesOrderedForLiquidation,
        address _safesOrderedForRedemption
    ) external onlyOwner {
        sbdToken = IMintableToken(_sbdToken);
        priceOracle = IPriceOracle(_priceOracle);
        stabilityPool = IStabilityPool(_stabilityPool);
        sbrTokenStaking = ISBRStaking(_sbrTokenStaking);
        // Initialize the contract
        safesOrderedForLiquidation = IDoublyLinkedList(
            _safesOrderedForLiquidation
        );
        safesOrderedForRedemption = IDoublyLinkedList(
            _safesOrderedForRedemption
        );
        sbdToken.approve(address(sbrTokenStaking), type(uint256).max);
        sbdToken.approve(address(stabilityPool), type(uint256).max);
        renounceOwnership();
    }

    function handleBorrow(
        uint256 safeId,
        Safe storage safe,
        uint256 amount,
        uint256 shieldingRate,
        uint256 nearestSpotInLiquidationQueue,
        uint256 nearestSpotInRedemptionQueue
    ) internal {
        // Safe storage currentSafe = safes[_safeId];
        require(
            ownerOf(safeId) == msg.sender,
            "Only the Safe owner can borrow"
        );
        uint256 _shieldingFee = (amount * shieldingRate) / BASIS_POINTS_DIVISOR;
        uint256 _minFeeWeightNode = safesOrderedForRedemption.getHead();
        // Is first time borrowing
        if (safe.borrowedAmount == 0) {
            if (_minFeeWeightNode == 0) {
                // There are no existing borrowings, so the fee is the minimum rate
                safe.weight = shieldingRate;
            } else {
                uint256 _minFeeWeight = safesOrderedForRedemption
                    .get(_minFeeWeightNode)
                    .value;
                // Adjust the fee percentage based on the minimum value, so the new borrowers don't start from the beginning.
                // This is to keep it fair for new borrowers, and is only an accounting trick.
                // Fee for new borrowers is in relation to the minimum rate paid by the existing borrowers
                safe.weight = _minFeeWeight + shieldingRate;
            }
        } else {
            uint256 _minFeeWeight = safesOrderedForRedemption
                .get(_minFeeWeightNode)
                .value;
            // ShieldingRate is always in relation to the minimum rate paid by the existing borrowers
            uint256 diff = safe.weight - _minFeeWeight;
            uint256 weightedDiff = (diff * safe.borrowedAmount) /
                BASIS_POINTS_DIVISOR;

            uint256 newFeeWeight = ((_shieldingFee + weightedDiff) *
                BASIS_POINTS_DIVISOR) / (safe.borrowedAmount + amount);

            // No need to charge the already borrowed amount as it has already been charged, just update the relative rate.
            if (shieldingRate > 0) {
                safe.weight = _minFeeWeight + newFeeWeight;
            }
        }
        if (amount < _shieldingFee) {
            revert("Borrowed amount is not sufficient to pay the fee");
        }
        uint _amountToBorrow = amount - _shieldingFee;
        safe.borrowedAmount += amount;
        safe.feePaid += _shieldingFee;

        // Calculate the ratio (borrowAmount per unit collateral)
        uint256 ratio = (safe.borrowedAmount) / safe.collateralAmount;

        IDoublyLinkedList.Node memory redemptionNode = safesOrderedForRedemption
            .upsert(safeId, safe.weight, nearestSpotInRedemptionQueue);

        IDoublyLinkedList.Node
            memory liquidationNode = safesOrderedForLiquidation.upsert(
                safeId,
                ratio,
                nearestSpotInLiquidationQueue
            );

        uint256 feePaid;
        uint256 canRefund;
        if (_shieldingFee > 0) {
            (feePaid, canRefund) = distributeFees(safeId, _shieldingFee, true);
        }
        if (canRefund > 0) {
            _amountToBorrow += canRefund;
            emit FeeRefund(safeId, canRefund);
        }
        // Mint SBD tokens to the borrower
        require(sbdToken.mint(msg.sender, _amountToBorrow), "Mint failed");
        _updateTotalDebt(totalDebt, amount, true);
        // Emit the Borrow event
        emit Borrowed(
            safeId,
            amount,
            safe.weight,
            totalCollateral,
            totalDebt,
            redemptionNode.prev,
            liquidationNode.prev
        );
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * Calculates the amount of collateral to redeem in a Safe
     *  If the user has total fee paid < REDEMPTION_BASE_FEE, whole collateral of the safe will be redeemed (including unused collateral), depending on redemption amount.
     *     - Reason: Redemptions could be used as a means of slippage free exchange at market price.
     *  If the user has total fee paid >= REDEMPTION_BASE_FEE, the collateral redeemed will be upto the borrowed amount of the safe.
     *
     * There is potential for price manipulation, but it also exists in the current redemption system due to the usage of price oracle.
     *
     * fee is calculated as follows:
     *  If the fee paid is less than REDEMPTION_BASE_FEE, the redemption fee to be paid by redeemer is (feePaidBasisPoints + REDEMPTION_BASE_FEE)
     *       - Fee is charged to the redeemer
     *       - Fee is also charged to the owner of the Safe at the time, based on the refund to be paid.
     *            ownerFee = (collateralValueRedeemed * REDEMPTION_BASE_FEE) / 10000 - feePaid
     *  If the fee paid is greater than REDEMPTION_BASE_FEE, the fee is min(feePaid + REDEMPTION_BASE_FEE, REDEMPTION_LIQUIDATION_FEE)
     *       - Fee is charged to the redeemer only
     *
     * The owner fee and redeemer fee from redemption is paid to Stability Pool stakers(100%).
     */
    function calculateRedemptionAmountsAndFee(
        Safe memory safe,
        uint256 amountToRedeem,
        uint256 collateralPrice
    )
        public
        pure
        returns (
            bool borrowMode,
            uint256 _collateralToRedeem,
            uint256 _amountToRedeem,
            uint256 _amountToRefund,
            uint256 _ownerFee,
            uint256 _redeemerFee
        )
    {
        uint256 collateralValue = (safe.collateralAmount * collateralPrice) /
            PRECISION;
        uint256 feePaidPercentage = ((safe.feePaid * BASIS_POINTS_DIVISOR) /
            collateralValue);
        // Fee tier to apply for this safe(applied to the redeemer)
        uint256 feeTier = min(
            feePaidPercentage + REDEMPTION_BASE_FEE,
            REDEMPTION_LIQUIDATION_FEE
        );
        /*
        If the fee paid is less than REDEMPTION_BASE_FEE, the redemption fee is (feePaid + REDEMPTION_BASE_FEE)
         */
        if (feePaidPercentage <= REDEMPTION_BASE_FEE) {
            if (amountToRedeem >= collateralValue) {
                // redeem the whole collateral, while refunding stablecoins back to the owner of the safe
                _amountToRedeem = safe.borrowedAmount;
                _amountToRefund = collateralValue - _amountToRedeem;
                _collateralToRedeem = safe.collateralAmount;
                // OWNER FEE = REDEMPTION BASE FEE for the
                // toPay = collateralValue * REDEMPTION_BASE_FEE / BASIS_POINTS_DIVISOR
                // toPay - feePaid
                uint256 ownerToPay = (collateralValue * REDEMPTION_BASE_FEE) /
                    BASIS_POINTS_DIVISOR;
                if (ownerToPay > safe.feePaid) {
                    _ownerFee = ownerToPay - safe.feePaid;
                }
            } else {
                if (amountToRedeem >= safe.borrowedAmount) {
                    _amountToRefund = amountToRedeem - safe.borrowedAmount;
                    _amountToRedeem = safe.borrowedAmount;
                    _collateralToRedeem =
                        ((_amountToRedeem + _amountToRefund) * PRECISION) /
                        collateralPrice;
                    _ownerFee =
                        ((_amountToRedeem + _amountToRefund) *
                            REDEMPTION_BASE_FEE) /
                        BASIS_POINTS_DIVISOR;
                    if (_ownerFee > safe.feePaid) {
                        _ownerFee = _ownerFee - safe.feePaid;
                    }
                } else {
                    _amountToRedeem = amountToRedeem;
                    _collateralToRedeem =
                        (amountToRedeem * PRECISION) /
                        collateralPrice;
                    _amountToRefund = 0;
                    _ownerFee = 0;
                }
                // No seller fee here
            }
        } else {
            borrowMode = true;
            if (amountToRedeem >= safe.borrowedAmount) {
                _amountToRedeem = safe.borrowedAmount;
                _collateralToRedeem =
                    (_amountToRedeem * PRECISION) /
                    collateralPrice;
                _amountToRefund = 0;
                _ownerFee = 0;
            } else {
                _amountToRedeem = amountToRedeem;
                _amountToRefund = 0;
                _ownerFee = 0;
                _collateralToRedeem =
                    (_amountToRedeem * PRECISION) /
                    collateralPrice;
                //amountToRedeem =
            }
        }
        _redeemerFee = (_collateralToRedeem * feeTier) / BASIS_POINTS_DIVISOR;
    }

    // Redemption always redeems the whole collateral
    function _redeemNode(
        uint256 _safeId,
        SBStructs.Redemption memory redemption,
        uint256 nearestSpotInLiquidationQueue
    ) internal returns (Safe memory, SBStructs.Redemption memory) {
        // bytes32 _safeId = bytes32(_safeId);
        Safe storage safe = safes[_safeId];
        _updateSafe(_safeId, safe);
        uint256 amountToRedeem = redemption.requestedAmount -
            redemption.redeemedAmount;
        uint256 collateralToRedeem = (amountToRedeem * PRECISION) /
            redemption.price;
        // Amount of collateral to return back to the redeemer
        uint256 collateralToReturn = collateralToRedeem;
        // Amount of stablecoins to refund the safe owner
        uint256 amountToRefund = 0;
        // Total fee(in percentage terms) paid by the safe owner
        // Total collateral value of the safe
        uint256 ownerFee = 0;
        uint256 redeemerFee = 0;
        bool borrowMode;
        (
            borrowMode,
            collateralToRedeem,
            amountToRedeem,
            amountToRefund,
            ownerFee,
            redeemerFee
        ) = calculateRedemptionAmountsAndFee(
            safe,
            amountToRedeem,
            redemption.price
        );
        if (amountToRefund > 0) {
            if (amountToRefund > ownerFee) {
                require(
                    sbdToken.transfer(
                        ownerOf(_safeId),
                        amountToRefund - ownerFee
                    ),
                    "Mint failed for owner fee"
                );
                emit OwnerRefunded(
                    redemption.redemptionId,
                    _safeId,
                    amountToRefund - ownerFee,
                    ownerFee
                );
            } else {
                // Nothing to pay owner
                emit OwnerRefunded(
                    redemption.redemptionId,
                    _safeId,
                    0,
                    ownerFee
                );
            }
            if (ownerFee > 0) {
                redemption.ownerFee += ownerFee;
                safe.feePaid = 0; // Reset the fee paid by the safe owner
                emit OwnerFeePaid(redemption.redemptionId, _safeId, ownerFee);
            }
        }
        // Total amount of collateral to return to the redeemer
        collateralToReturn = collateralToRedeem - redeemerFee;
        if (redeemerFee > 0) {
            redemption.redeemerFee += redeemerFee;
            emit RedeemerFeePaid(
                redemption.redemptionId,
                _safeId,
                collateralToRedeem,
                collateralToReturn,
                redeemerFee
            );
        }
        // update target shielding rate
        return
            redeemSafe(
                _safeId,
                borrowMode,
                amountToRedeem,
                amountToRefund,
                collateralToRedeem,
                collateralToReturn,
                safe,
                nearestSpotInLiquidationQueue,
                redemption
            );
    }

    function _redeemSafes(
        SBStructs.Redemption memory redemption,
        uint256 nearestSpotInLiquidationQueue
    ) internal returns (SBStructs.Redemption memory) {
        uint256 processedSpots = redemption.processedSpots;
        // Target within 1% = 100 points, 100% = 10000 points
        while (redemption.redeemedAmount < redemption.requestedAmount) {
            //uint256 spotForUpdate = 0;
            uint256 head = safesOrderedForRedemption.getHead();
            (, redemption) = _redeemNode(
                head,
                redemption,
                nearestSpotInLiquidationQueue
            );
            processedSpots++;
        }
        redemption.processedSpots = processedSpots;
        return redemption;
    }

    function closeToZero(uint256 value) internal pure returns (bool) {
        return value < 1e10;
    }

    function redeemSafe(
        uint256 _safeId,
        bool borrowMode,
        uint256 amountToRedeem,
        uint256 amountToRefund,
        uint256 collateralToRedeem,
        uint256 collateralToReturn,
        Safe memory safe,
        uint256 nearestSpotInLiquidationQueue,
        SBStructs.Redemption memory redemption
    ) internal returns (Safe memory, SBStructs.Redemption memory) {
        //uint256 amountInCollateral = amountToRedeem /
        safe.collateralAmount -= collateralToRedeem;
        safe.borrowedAmount -= amountToRedeem;
        redemption.collateralAmount += collateralToReturn;
        redemption.redeemedAmount += amountToRedeem + amountToRefund;
        redemption.refundedAmount += amountToRefund;
        safes[_safeId] = safe;
        // If the safe is empty(borrowedAmount == 0 in BORROW mode or when the collateral has been fully redeemed in EXCHANGE mode)
        // Borrow mode: If fee paid > REDEMPTION_BASE_FEE
        // Exchange mode; If fee paid <= REDEMPTION_BASE_FEE
        if (
            (safe.borrowedAmount == 0 && borrowMode) ||
            (!borrowMode && closeToZero(safe.collateralAmount))
        ) {
            _removeSafeFromBothQueues(_safeId);
        } else {
            uint256 newRatio = safe.borrowedAmount / safe.collateralAmount;
            IDoublyLinkedList.Node
                memory liquidationNode = safesOrderedForLiquidation.upsert(
                    _safeId,
                    newRatio,
                    nearestSpotInLiquidationQueue
                );
            emit LiquidationQueueUpdated(
                _safeId,
                newRatio,
                liquidationNode.next
            );
        }
        emit Redeemed(
            redemption.redemptionId,
            _safeId,
            amountToRedeem,
            collateralToRedeem,
            amountToRefund,
            redemption.requestedAmount - redemption.redeemedAmount
        );
        return (safe, redemption);
    }

    function _redeemToUser(SBStructs.Redemption memory redemption) internal {
        uint256 collateralRefund = 0;
        if (redemption.ownerFee > 0) {
            if (stabilityPoolCanReceiveRewards) {
                require(
                    stabilityPool.addReward(redemption.ownerFee),
                    "Add reward failed"
                );
                emit OwnerRedemptionFeeDistributed(
                    redemption.redemptionId,
                    redemption.ownerFee
                );
            } else {
                require(
                    sbdToken.transfer(msg.sender, redemption.ownerFee),
                    "Owner fee refund failed"
                );
            }
        }
        if (redemption.redeemerFee > 0 && stabilityPoolCanReceiveRewards) {
            require(
                stabilityPool.addCollateralReward{
                    value: redemption.redeemerFee
                }(redemption.redeemerFee),
                "Add collateral reward failed"
            );
        } else {
            collateralRefund = redemption.redeemerFee;
        }
        (bool success, ) = msg.sender.call{
            value: redemption.collateralAmount + collateralRefund
        }("");
        require(success, "Transfer failed");
    }

    function distributeFees(
        uint256 safeId,
        uint fee,
        bool mint
    ) internal returns (uint256 feePaid, uint256 canRefund) {
        if (mint) {
            require(sbdToken.mint(address(this), fee), "Mint failed");
        }
        uint256 sbrStakersFee = (fee * SBR_FEE_REWARD) / 10000;
        uint256 stabilityPoolFee = fee;
        canRefund = fee;
        bool feeAdded1 = sbrTokenStaking.addReward(sbrStakersFee);
        if (feeAdded1) {
            stabilityPoolFee = fee - sbrStakersFee;
            feePaid = fee;
            canRefund -= sbrStakersFee;
        }
        bool feeAdded2 = stabilityPool.addReward(stabilityPoolFee);
        if (feeAdded2) {
            feePaid += stabilityPoolFee;
            canRefund -= stabilityPoolFee;
        }
        require(canRefund <= fee, "Invalid refund amount");
        if (canRefund > 0 && mint) {
            require(sbdToken.burn(address(this), canRefund), "Burn failed");
        }
        emit FeeDistributed(
            safeId,
            feePaid,
            mint,
            sbrStakersFee,
            stabilityPoolFee,
            canRefund
        );
    }

    function distributeDebtAndCollateral(
        uint256 debtAmount,
        uint256 collateralAmount,
        uint256 totalCollateralAfterLiquidation
    ) internal {
        cumulativeCollateralPerUnitCollateral +=
            (collateralAmount * PRECISION) /
            totalCollateralAfterLiquidation;
        cumulativeDebtPerUnitCollateral +=
            (debtAmount * PRECISION) /
            totalCollateralAfterLiquidation;
    }

    // Internal function to update a safe's borrowed amount and deposited amount
    function _updateSafe(
        uint _safeId,
        Safe storage _safe
    ) internal returns (Safe memory) {
        // Update borrowed amount
        LiquidationSnapshot storage liquidationSnapshot = liquidationSnapshots[
            _safeId
        ];
        if (
            liquidationSnapshot.collateralPerCollateralSnapshot !=
            cumulativeCollateralPerUnitCollateral
        ) {
            uint debtIncrease = (_safe.collateralAmount *
                (cumulativeDebtPerUnitCollateral -
                    liquidationSnapshot.debtPerCollateralSnapshot)) / PRECISION;
            _safe.borrowedAmount += debtIncrease;
            liquidationSnapshot
                .debtPerCollateralSnapshot = cumulativeDebtPerUnitCollateral;

            // Update deposited amount
            uint collateralIncrease = (_safe.collateralAmount *
                (cumulativeCollateralPerUnitCollateral -
                    liquidationSnapshot.collateralPerCollateralSnapshot)) /
                PRECISION;
            _safe.collateralAmount += collateralIncrease;
            liquidationSnapshot
                .collateralPerCollateralSnapshot = cumulativeCollateralPerUnitCollateral;

            totalCollateral += collateralIncrease;
            _updateTotalDebt(totalDebt, debtIncrease, true);
        }

        return _safe;
    }

    function _updateTotalDebt(
        uint256 currentDebt,
        uint256 delta,
        bool add
    ) internal returns (uint256) {
        uint256 debt = currentDebt;
        if (add) {
            debt = currentDebt + delta;
        } else {
            debt = currentDebt - delta;
        }
        // Bootstrap Mode to Normal mode only once, Normal mode to bootstrap mode is not possible
        if (
            debt > BOOTSTRAP_MODE_DEBT_THRESHOLD &&
            PROTOCOL_MODE == SBStructs.Mode.BOOTSTRAP
        ) {
            PROTOCOL_MODE = SBStructs.Mode.NORMAL;
        }
        totalDebt = debt;
        return debt;
    }

    modifier onlyInNormalMode() {
        require(
            PROTOCOL_MODE == SBStructs.Mode.NORMAL,
            "Protocol in bootstrap mode"
        );
        _;
    }

    function _removeSafe(uint256 _safeId) internal {
        //safes[_safeId].status = SafeStatus.CLOSED;
        delete safes[_safeId];
        _burn(_safeId);
    }

    function _removeSafeFromBothQueues(uint256 safeId) internal {
        safesOrderedForLiquidation.remove(safeId);
        emit SafeRemovedFromLiquidationQueue(safeId);
        safesOrderedForRedemption.remove(safeId);
        emit SafeRemovedFromRedemptionQueue(safeId);
    }

    function setCanStabilityPoolReceiveRewards(
        bool canReceiveRewards
    ) external returns (bool) {
        require(msg.sender == address(stabilityPool), "Only stability pool");
        stabilityPoolCanReceiveRewards = canReceiveRewards;
        return true;
    }

    function setCanSBRStakingPoolReceiveRewards(
        bool canReceiveRewards
    ) external returns (bool) {
        require(msg.sender == address(sbrTokenStaking), "Only SBR Staking");
        sbrStakingPoolCanReceiveRewards = canReceiveRewards;
        return true;
    }
}
