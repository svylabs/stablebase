// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ReservePool {

    mapping(uint256 => uint256) public tokensStaked;

    function stake(uint256 id, uint256 amount) external {
        tokensStaked[id] += amount;
    }

    function unstake(uint256 id, uint256 amount) external {
        tokensStaked[id] -= amount;
    }

}