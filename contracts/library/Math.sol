// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../Structures.sol";

library Math {
    uint256 public constant DAYS_IN_YEAR = 365;
    uint256 public constant HOURS_IN_DAY = 24;

    struct Rate {
        uint256 weightedSum;
        uint256 totalWeight;
    }

    function calculateRate(Rate memory rate) internal pure returns (uint256) {
        if (rate.totalWeight == 0) {
            return 0;
        }
        return (rate.weightedSum * 100) / rate.totalWeight;
    }

    function add(Rate memory rate, uint256 value, uint256 weight) internal pure returns (Rate memory) {
        rate.weightedSum += value * weight;
        rate.totalWeight += weight;
        return rate;
    }

    function subtract(Rate memory rate, uint256 value, uint256 weight) internal pure returns (Rate memory){
        rate.weightedSum -= value * weight;
        rate.totalWeight -= weight;
        return rate;
    }

    function getShieldingHours(Rate memory referenceRate, uint256 currentRate) internal pure returns (uint256) {
        if (referenceRate.totalWeight == 0) {
            return 0;
        }
        //uint256 _referenceRate = (referenceRate.weightedSum / referenceRate.totalWeight);
        // referenceRate = (weightedSum / totalWeight);
        // formula: ((currentRate * 24 * 365)) / (weightedSum / totalWeight)
        return (currentRate * (HOURS_IN_DAY * DAYS_IN_YEAR) * referenceRate.totalWeight)  / referenceRate.weightedSum;
    }

    function toSeconds(uint256 hours_) internal pure returns (uint256) {
        return hours_ * 3600;
    }

    function getRate(uint256 _rate, SBStructs.StabilityType stabilityType) internal pure returns (uint256, uint256) {
        uint256 value = (_rate >> (32 * uint(stabilityType))) & 0xff;
        return (value >> 1, value & 1);
    }

    function setRate(uint256 _rate, uint256 _newRate, SBStructs.StabilityType stabilityType) internal pure returns (uint256) {
        uint256 mask = 0xff << (32 * uint(stabilityType));
        uint256 enabledRate = (_newRate << 1) | 1;
        return (_rate & ~mask) | (enabledRate << (32 * uint(stabilityType)));
    }

}