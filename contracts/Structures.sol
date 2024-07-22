// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./library/Math.sol";

library SBStructs {
    struct Safe {
        address token;
        uint256 depositedAmount;
        uint256 borrowedAmount;
        uint256 reserveRatio;
        uint256 originationFeePaid;
    }

    enum Mode {
        BOOTSTRAP,
        NORMAL
    }

    struct GlobalVars {
        uint256 totalMintedSBD;
        Math.Rate referenceOriginationFeeRate;
        Math.Rate referenceReserveRatio;
    }
}