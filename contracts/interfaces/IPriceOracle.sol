// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPriceOracle {
    function lastGoodPrice() external view returns (uint256);

    function fetchPrice() external returns (uint256);
}
