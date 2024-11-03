pragma solidity ^0.8.20;

interface IStableBase {
    event OpenSafe(
        uint256 indexed safeId,
        address indexed owner,
        uint256 amount
    );
    event Borrow(uint256 indexed safeId, uint256 amount);
    event CloseSafe(uint256 indexed safeId);
    event BorrowFeeRefund(uint256 indexed safeId, uint256 amount);

    function openSafe(uint256 _safeId, uint256 _amount) external payable;

    function closeSafe(uint256 _safeId) external;

    /**
     * Users can borrow Stablecoins from the system upto 90.9% of the lockedup collateral value.
     *
     * The system will charge a fee based on the _shieldingRate the user wants to pay. The _shieldingRate is the percentage of the fee that the user wants to pay upfront.
     *
     * Each safe goes into liquidation queue based on the LTV ratio.
     *
     * Each safe goes into redemption queue based on a feeWeight calculated by the protocol.
     *
     * feeWeight is calculated as follows:
     *
     * If no existing safes in redemption queue:
     *    safe.feeWeight = shieldingRate
     * else:
     *   if there is no existing borrowing for the user:
     *      minFeeWeightInSystem = minimum feeWeight in the system(i.e- feeWeight of the the first safe in the redemption queue)
     *      safe.feeWeight = minFeeWeightInSystem + shieldingRate
     *   else:
     *      minFeeWeightInSystem = minimum feeWeight in the system(i.e- feeWeight of the the first safe in the redemption queue)
     *      diff = (safe.feeWeight - minFeeWeightInSystem)
     *      feeWeightOfExistingBorrowing = diff * safe.borrowAmount
     *      sheildingFee = shieldingRate * newBorrowAmount
     *      relativeFeeWeight = (feeWeightOfExistingBorrowing + shieldingFee) / (safe.borrowAmount + newBorrowAmount)
     *      safe.feeWeight = minFeeWeightInSystem + relativeFeeWeight
     *
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
        uint256 feeRate,
        uint256 nearestSpotInRedemptionQueue
    ) external;

    function liquidate() external;

    // TODO: add more functions
    // liquidate
    // withdraw
    // setReserveRatio
    // setTargetShieldingRate
}
