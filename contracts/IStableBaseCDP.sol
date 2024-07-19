// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStableBaseCDP {
    function openSafe(address collateralToken, uint256 amount, uint256 reserveRatio, uint256 positionInReserve) external;
    function closeSafe(address collateralToken) external;
    function borrow(address collateralToken, uint256 amount) external;
    function repay(address collateralToken, uint256 amount) external;
    function withdrawCollateral(address collateralToken, uint256 amount) external;
    function redeem(uint256 id) external;
    function liquidate(uint256 id) external;
    function repayAndLiquidate(uint256 id) external;
    function updateReserveRatio(address collateralToken, uint256 newReserveRatio, uint256 newPositionInReserve) external;
}