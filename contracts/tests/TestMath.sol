// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../library/Math.sol";

contract TestMath {
    
    Math.Rate public rate = Math.Rate(0, 0);

    function addValue(uint256 value, uint256 weight) external {
        rate = Math.add(rate, value, weight);
    }

    function subtractValue(uint256 value, uint256 weight) external {
        rate = Math.subtract(rate, value, weight);
    }

    function calculateRate() external view returns (uint256) {
        return Math.calculateRate(rate);
    }

}