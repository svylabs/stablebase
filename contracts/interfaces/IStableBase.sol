pragma solidity ^0.8.20;

interface IStableBase {
    event OpenSafe(
        uint256 indexed safeId,
        address indexed owner,
        uint256 amount
    );
    event Borrow(uint256 indexed safeId, uint256 amount, uint256 weight);
    event CloseSafe(uint256 indexed safeId);
    event BorrowFeeRefund(uint256 indexed safeId, uint256 amount);
    event FeeTopup(
        uint256 indexed safeId,
        uint256 topupRate,
        uint256 feePaid,
        uint256 newWeight
    );

    function openSafe(uint256 _safeId, uint256 _amount) external payable;

    function closeSafe(uint256 _safeId) external;

    /**
     * Users can borrow Stablecoins from the system upto 90.9% of the lockedup collateral value.
     *
     * The system will charge a fee based on the _shieldingRate the user wants to pay. The _shieldingRate is the percentage of the fee that the user wants to pay upfront.
     *
     * Each safe goes into liquidation queue based on the LTV ratio.
     *
     * Each safe goes into redemption queue based on a weight calculated by the protocol based on the fee paid. Safe with lowest weight is redeemed first.
     *
     * weight of the safe is calculated as follows:
     *
     * If no existing safes in redemption queue:
     *    safe.weight = shieldingRate
     * else:
     *   if there is no existing borrowing for the user:
     *      minWeightInSystem = minimum Weight in the system(i.e- weight of the the first safe in the redemption queue)
     *      safe.weight = minWeightInSystem + shieldingRate
     *   else:
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

    function withdrawCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external;

    function redeem(uint256 _amount, bytes calldata redemptionParams) external;

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
