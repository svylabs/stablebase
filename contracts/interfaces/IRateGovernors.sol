// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRateGovernors {
    struct RateGovernor {
        uint256 reserveAmount; // Amount staked by the Rate Governor
        uint256 debtAmount; // Total debt assigned to the Rate Governor
        uint256 collateralAmount; // Collateral assigned to the Rate Governor
        uint256 lastCumulativeDebtPerDebtUnit;
        uint256 lastCumulativeCollateralPerDebtUnit;
    }

    function updateTargetShieldingRate(
        uint256 id,
        uint256 _targetShieldingRate
    ) external;

    function updateReserveRatio(uint256 _reserveRatio) external;

    /**
     * Redemption should start with rate governor.
     */

    function redeem() external;

    function addStake(uint256 id, uint256 amount) external;

    function getStake(uint256 id) external view returns (uint256);

    function removeStake(
        uint256 id,
        uint256 amount
    ) external returns (bool, uint256);

    function removeStake(uint256 id) external returns (bool, uint256);
}
