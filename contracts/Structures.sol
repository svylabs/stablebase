// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./library/Math.sol";

library SBStructs {
    struct Safe {
        address token;
        uint256 depositedAmount;
        uint256 borrowedAmount;
        uint256 rates;
        uint256 shieldedUntil;
    }

    struct WhitelistedToken {
        address priceOracle;
        uint256 collateralRatio;
    }

    enum Mode {
        BOOTSTRAP,
        NORMAL
    }

    enum StabilityType {
        SHIELDING_RATE,
        RESERVE_RATIO,
        TARGET_SHIELDING_RATE
    }

    struct GlobalVars {
        uint256 totalMintedSBD;
        Math.Rate referenceOriginationFeeRate;
        Math.Rate referenceReserveRatio;
    }
}