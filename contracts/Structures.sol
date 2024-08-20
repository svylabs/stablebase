// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./library/Math.sol";

library SBStructs {
    struct Safe {
        address owner;
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
        MINT_WITH_PROTECTION, // 00 - shielding rate
        MINT_WITH_MANUAL_STABILITY, // 01 - reserve ratio
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
    }

    struct RedemptionToken {
        address token;
        uint256 amount;
    }
}