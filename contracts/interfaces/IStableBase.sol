interface IStableBase {
    function openSafe(address token, uint256 amount) external;

    function closeSafe(address token) external;

    function borrowWithParams(
        address token,
        uint256 amount,
        bytes calldata borrowParams
    ) external;

    function repay(address token, uint256 amount) external;

    function redeem(
        uint256 amount,
        bytes calldata redemptionParams
    ) external returns (uint256);

    function renewShielding(address token, uint256 feeRate) external;

    // TODO: add more functions
    // liquidate
    // withdraw
    // setReserveRatio
    // setTargetShieldingRate
}
