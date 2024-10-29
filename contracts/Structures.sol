// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./library/Math.sol";

library SBStructs {
    struct Safe {
        address token;
        uint256 depositedAmount;
        uint256 borrowedAmount;
        uint256 paidFeePercentage;
        uint256 totalFeePaid;
        uint256 discountedFee; // Used only for accounting purpose, and not for actual calculations
    }

    struct WhitelistedToken {
        address priceOracle;
        uint256 collateralRatio;
    }

    enum Mode {
        BOOTSTRAP,
        NORMAL
    }

    struct GlobalVars {
        uint256 totalMintedSBD;
        Math.Rate referenceOriginationFeeRate;
    }

    struct Redemption {
        uint256 requestedAmount;
        uint256 redeemedAmount;
        uint256 processedSpots;
        uint256 collateralAmount;
    }

    struct RedemptionToken {
        address token;
        uint256 amount;
    }
}
