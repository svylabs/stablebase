// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../interfaces/IPriceOracle.sol";

contract MockPriceOracle is IPriceOracle {
    // function getPrice() external view override returns (uint256) {
    function getPrice() external pure override returns (uint256) {
        return 1000;
    }
}
