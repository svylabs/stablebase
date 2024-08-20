// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IReservePool.sol";

contract ReservePool is IReservePool {
    mapping(uint256 => uint256) public tokensStaked;

    function addStake(uint256 id, uint256 amount) external {
        tokensStaked[id] += amount;
    }

    function getStake(uint id) external view returns (uint256) {
        return tokensStaked[id];
    }

    function removeStake(uint256 id, uint256 amount) external {
        tokensStaked[id] -= amount;
    }

    function removeStake(uint256 id) external {
        tokensStaked[id] = 0;
    }
}
