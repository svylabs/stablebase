// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../Structures.sol";

library Math {
    uint256 public constant DAYS_IN_YEAR = 365;
    uint256 public constant HOURS_IN_DAY = 24;
    uint256 public constant DAYS_IN_MONTH = 30;

    struct Rate {
        uint256 weightedSum;
        uint256 totalWeight;
    }

    function calculateRate(Rate memory rate) internal pure returns (uint256) {
        if (rate.totalWeight == 0) {
            return 0;
        }
        return ((rate.weightedSum * 10000) / rate.totalWeight) / 10000;
    }

    function add(
        Rate memory rate,
        uint256 value,
        uint256 weight
    ) internal pure returns (Rate memory) {
        rate.weightedSum += value * weight;
        rate.totalWeight += weight;
        return rate;
    }

    function subtract(
        Rate memory rate,
        uint256 value,
        uint256 weight
    ) internal pure returns (Rate memory) {
        rate.weightedSum -= value * weight;
        rate.totalWeight -= weight;
        return rate;
    }

    function isZero(Rate memory rate) internal pure returns (bool) {
        return rate.totalWeight == 0 || rate.weightedSum == 0;
    }

    function getShieldingHours(
        Rate memory referenceRate,
        uint256 currentRate
    ) internal pure returns (uint256) {
        if (referenceRate.totalWeight == 0 || referenceRate.weightedSum == 0) {
            return 0;
        }
        //uint256 _referenceRate = (referenceRate.weightedSum / referenceRate.totalWeight);
        // referenceRate = (weightedSum / totalWeight);
        // formula: ((currentRate * 24 * 365)) / (weightedSum / totalWeight)
        return
            (currentRate *
                (HOURS_IN_DAY * DAYS_IN_YEAR) *
                referenceRate.totalWeight) / referenceRate.weightedSum;
    }

    function toSeconds(uint256 hours_) internal pure returns (uint256) {
        return hours_ * 3600;
    }
}
