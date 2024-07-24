// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStableBaseCDP {
    /**
     * @dev Opens a new Safe, and sets the parameters of the safe.
     * 
     */
    function openSafe(address collateralToken, uint256 amount, uint256 reserveRatio, uint256 positionInReserve) external;

    /**
     * @dev Closes are Safe and returns the collateral to the owner.
     * 
     */
    function closeSafe(address collateralToken) external;

    /**
     * @dev Borrow `amount` stablecoins.
     */
    function borrow(address collateralToken, uint256 amount) external;

    /**
     * @dev Repay `amount` stablecoins.
     * 
     */
    function repay(address collateralToken, uint256 amount) external;

    /**
     * @dev Withdraw collateral from the Safe.
     * 
     */
    function withdrawCollateral(address collateralToken, uint256 amount) external;

    /**
     * @dev Redeem collateral for the specified amount of stablecoins.
     */
    function redeem(uint256 amount) external;

    /**
     * @dev Liquidate a safe - trigger automatic liquidation by spreading the collateral across other safe owners.
     */
    function liquidate(uint256 id) external;

    /**
     * @dev Repay 
     */
    function repayAndLiquidate(uint256 id) external;
    function updateReserveRatio(address collateralToken, uint256 newReserveRatio, uint256 newPositionInReserve) external;
    function updateOriginationFee(address collateralToken, uint256 newOriginationFee) external;
}