// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./library/Math.sol";

library SBStructs {
    struct Safe {
        uint256 collateralAmount;
        uint256 borrowedAmount;
        uint256 feeWeight;
        uint256 totalFeePaid;
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
