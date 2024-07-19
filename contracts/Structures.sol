// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library SBStructs {
    struct Safe {
        address token;
        uint256 depositedAmount;
        uint256 borrowedAmount;
        uint256 reserveRatio;
        uint256 originationFeePaid;
    }
}
