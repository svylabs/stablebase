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

    enum BorrowMode {
        NORMAL_BORROWING, // 00 - shielding rate
        RATE_GOVERNOR, // 01 - reserve ratio
        BORROW_FROM_POOL // 10
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

    struct Redemption {
        uint256 requestedAmount;
        uint256 redeemedAmount;
        RedemptionToken[10] tokensList;
        uint256 tokensCount;
        uint256 processedSpots;
    }

    struct RedemptionToken {
        address token;
        uint256 amount;
    }
}
