// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Math} from "./Math.sol";

library RateLib {
    function calculateRate(
        Math.Rate memory rate
    ) internal pure returns (uint256) {
        if (rate.totalWeight == 0) {
            return 0;
        }
        return ((rate.weightedSum * 10000) / rate.totalWeight) / 10000;
    }

    function add(
        Math.Rate memory rate,
        uint256 value,
        uint256 weight
    ) internal pure returns (Math.Rate memory) {
        rate.weightedSum += value * weight;
        rate.totalWeight += weight;
        return rate;
    }

    function subtract(
        Math.Rate memory rate,
        uint256 value,
        uint256 weight
    ) internal pure returns (Math.Rate memory) {
        rate.weightedSum -= value * weight;
        rate.totalWeight -= weight;
        return rate;
    }

    function isZero(Math.Rate memory rate) internal pure returns (bool) {
        return rate.totalWeight == 0 || rate.weightedSum == 0;
    }
}
