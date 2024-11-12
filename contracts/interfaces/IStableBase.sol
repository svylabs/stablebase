pragma solidity ^0.8.20;

interface IStableBase {
    event OpenSafe(
        uint256 indexed safeId,
        address indexed owner,
        uint256 amount,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event Borrowed(
        uint256 indexed safeId,
        uint256 amount,
        uint256 weight,
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 nearestSpotInRedemptionQueue,
        uint256 nearestSpotInLiquidationQueue
    );
    event SafeClosed(
        uint256 indexed safeId,
        uint256 refundedCollateral,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event FeeRefund(uint256 indexed safeId, uint256 amount);
    event AddedCollateral(
        uint256 indexed safeId,
        uint256 amount,
        uint256 newRatio,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event WithdrawnCollateral(
        uint256 indexed safeId,
        uint256 amount,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event Repaid(
        uint256 indexed safeId,
        uint256 amount,
        uint256 newRatio,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event Redeemed(
        uint256 indexed safeId,
        uint256 amount,
        uint256 collateral,
        uint256 refundedToOwner
    );
    event RedeemedBatch(
        uint256 amount,
        uint256 redeemedCollateral,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event LiquidatedUsingStabilityPool(
        uint256 indexed safeId,
        uint256 borrowAmount,
        uint256 collateral,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event LiquidatedUsingSecondaryMechanism(
        uint256 indexed safeId,
        uint256 borrowAmount,
        uint256 collateral,
        uint256 totalCollateral,
        uint256 totalDebt
    );

    event FeeTopup(
        uint256 indexed safeId,
        uint256 topupRate,
        uint256 feePaid,
        uint256 newWeight
    );
    event LiquidationQueueUpdated(
        uint256 safeId,
        uint256 newRatio,
        uint256 nextNode
    );
    event SafeRemovedFromLiquidationQueue(uint256 safeId);
    event RedemptionQueueUpdated(
        uint256 safeId,
        uint256 newWeight,
        uint256 prevNode
    );
    event SafeRemovedFromRedemptionQueue(uint256 safeId);
    event FeeDistributed(
        uint256 indexed safeId,
        uint256 fee,
        bool mint,
        uint256 sbrStakersFee,
        uint256 stabilityPoolFee,
        uint256 canRefund
    );
    event OwnerRefunded(
        uint256 indexed redemptionId,
        uint256 indexed safeId,
        uint256 refund,
        uint256 fee
    );
    event RedeemerFeePaid(
        uint256 indexed redemptionId,
        uint256 indexed safeId,
        uint256 feePaid
    );
    event OwnerFeePaid(
        uint256 indexed redemptionId,
        uint256 indexed safeId,
        uint256 feePaid
    );
    event OwnerRedemptionFeeDistributed(
        uint256 indexed redemptionId,
        uint256 feePaid
    );
    event RedeemerRedemptionFeeDistributed(
        uint256 indexed redemptionId,
        uint256 feePaid
    );

    struct Safe {
        uint256 collateralAmount;
        uint256 borrowedAmount;
        uint256 weight;
        SafeStatus status;
        uint256 feePaid;
    }

    enum SafeStatus {
        OPEN,
        CLOSED,
        LIQUIDATED,
        REDEEMED
    }

    function openSafe(uint256 _safeId, uint256 _amount) external payable;

    function closeSafe(uint256 _safeId) external;

    /**
     * Users can borrow Stablecoins from the system upto 90.9% of the lockedup collateral value.
     *
     * The system will charge a fee based on the _shieldingRate the user wants to pay. The _shieldingRate is the percentage of the borrowing that the user wants to pay upfront.
     *
     * Each safe goes into liquidation queue based on the LTV ratio.
     *
     * Each safe goes into redemption queue based on a weight calculated by the protocol based on the fee paid. Safe with lowest weight is redeemed first.
     *
     * weight of the safe is calculated as follows: If the weight of the safe is the same, the redemption will prioritize Last In First Out.
     *
     * If no existing safes in redemption queue:
     *    safe.weight = shieldingRate
     * else:
     *   if there is no existing borrowing for the user:
     *      minWeightInSystem = minimum Weight in the system(i.e- weight of the the first safe in the redemption queue)
     *      safe.weight = minWeightInSystem + shieldingRate
     *   else:
     *      // Caclulate the average weight based on existing and new borrowing and add it to the minWeightInSystem
     *      minWeightInSystem = minimum Weight in the system(i.e- weight of the the first safe in the redemption queue)
     *      relativeWeight = (safe.weight - minWeightInSystem)
     *      TotalWeightOfExistingBorrowing = relativeWeight * safe.borrowAmount
     *      TotalWeightOfAdditionalBorrowing = shieldingRate * additionalBorrowAmount
     *      newRelativeWeight = (TotalWeightOfExistingBorrowing + TotalWeightOfAdditionalBorrowing) / (safe.borrowAmount + additionalBorrowAmount)
     *      safe.weight = minWeightInSystem + newRelativeWeight
     *
     *
     * @param safeId - The id of the safe
     * @param amount - The amount of stablecoins to borrow
     * @param shieldingRate - The percentage of the fee that the user wants to pay upfront
     * @param nearestSpotInLiquidationQueue - The nearest safe in liquidation queue where this safe can be inserted
     * @param nearestSpotInRedemptionQueue  - The nearest safe in liquidation queue where this safe can be inserted
     */
    function borrow(
        uint256 safeId,
        uint256 amount,
        uint256 shieldingRate,
        uint256 nearestSpotInLiquidationQueue,
        uint256 nearestSpotInRedemptionQueue
    ) external;

    function repay(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external;

    function addCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external payable;

    function withdrawCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external;

    function redeem(
        uint256 _amount,
        uint256 nearestSpotInLiquidationQueue
    ) external;

    function feeTopup(
        uint256 safeId,
        uint256 topupRate,
        uint256 nearestSpotInRedemptionQueue
    ) external;

    function liquidate() external;

    // TODO: add more functions
    // liquidate
    // withdraw
    // setReserveRatio
    // setTargetShieldingRate
}
