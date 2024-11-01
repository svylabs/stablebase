pragma solidity ^0.8.20;

interface IStableBase {
    event OpenSafe(
        uint256 indexed safeId,
        address indexed owner,
        uint256 amount
    );
    event Borrow(uint256 indexed safeId, uint256 amount);
    event CloseSafe(uint256 indexed safeId);

    function openSafe(uint256 _safeId, uint256 _amount) external payable;

    function closeSafe(uint256 _safeId) external;

    function borrow(
        uint256 _safeId,
        uint256 _amount,
        uint256 _shieldingRate,
        uint256 _nearestSpotInLiquidationQueue,
        uint256 _nearestSpotInRedemptionQueue
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
