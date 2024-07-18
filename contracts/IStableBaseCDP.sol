interface IStableBaseCDP {
    function openSafe(address collateralToken, uint256 amount, uint256 reserveRatio, uint256 positionInReserve) external;
    function closeSafe(address collateralToken) external;
    function borrowSBD(address collateralToken, uint256 amount) external;
    function repaySBD(address collateralToken, uint256 amount) external;
    function withdrawCollateral(address collateralToken, uint256 amount) external;
    function redeem(uint256 id) external;
    function liquidate(uint256 id) external;
    function repayAndLiquidate(uint256 id) external;
    function updateReserveRatio(address collateralToken, uint256 newReserveRatio, uint256 newPositionInReserve) external;
}