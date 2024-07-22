pragma solidity ^0.8.20;

library Math {
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
}