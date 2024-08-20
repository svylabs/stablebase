interface IStableBase {
    function openSafe(address token, uint256 amount) external payable;

    function closeSafe(address token) external;

    function borrowWithParams(
        address token,
        uint256 amount,
        bytes calldata borrowParams
    ) external;

    function repay(address token, uint256 amount) external;

    function redeem(uint256 amount, bytes calldata redemptionParams) external;

    function renewSafe(
        address token,
        uint256 feeRate,
        bytes calldata renewParams
    ) external;

    // TODO: add more functions
    // liquidate
    // withdraw
    // setReserveRatio
    // setTargetShieldingRate
}
