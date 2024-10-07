// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IReservePool.sol";

contract ReservePool is IReservePool {
    struct RateGovernor {
        uint256 stakeAmount; // Amount of stablecoins staked
        uint256 debtAmount; // Total debt of the Rate Governor
        uint256 collateralAmount; // Collateral deposited by the Rate Governor
        uint256 lastCumulativeDebtPerDebtUnit;
        uint256 lastCumulativeCollateralPerDebtUnit;
    }

    // Total debt and stake of all Rate Governors
    uint256 public totalDebt;
    uint256 public totalStake;
    // Global cumulative variables for liquidation distribution
    uint256 public cumulativeDebtPerDebtUnit;
    uint256 public cumulativeCollateralPerDebtUnit;

    mapping(uint => RateGovernor) public rateGovernors;
    mapping(uint256 => uint256) public tokensStaked;

    function addStake(uint256 id, uint256 amount) external {
        tokensStaked[id] += amount;
        rateGovernors[id].stakeAmount += amount;
    }

    function getStake(uint id) external view returns (uint256) {
        return tokensStaked[id];
    }

    function removeStake(
        uint256 id,
        uint256 amount
    ) public returns (bool, uint256) {
        uint256 staked = tokensStaked[id];
        tokensStaked[id] = staked - amount;
        return (true, staked);
    }

    function removeStake(uint256 id) external returns (bool, uint256) {
        uint256 staked = tokensStaked[id];
        return removeStake(id, staked);
    }
}
