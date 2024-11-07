// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./library/Math.sol";
import "./interfaces/IStableBase.sol";

library SBStructs {
    enum Mode {
        BOOTSTRAP,
        NORMAL
    }

    struct Redemption {
        uint256 requestedAmount;
        uint256 price;
        uint256 redeemedAmount;
        uint256 processedSpots;
        uint256 collateralAmount;
    }

    struct RedemptionToken {
        address token;
        uint256 amount;
    }
}
