// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./Structures.sol";
import "./Utilities.sol";
import "./SBDToken.sol";
import "./dependencies/price-oracle/MockPriceOracle.sol";
import "./interfaces/IPriceOracle.sol";
import "./library/OrderedDoublyLinkedList.sol";
import "./interfaces/IDoublyLinkedList.sol";
import "./interfaces/IReservePool.sol";
import "./ReservePool.sol";
import "./StableBase.sol";

contract StableBaseCDP is StableBase {
    constructor(address _sbdToken) {
        whitelistedTokens[address(0)] = SBStructs.WhitelistedToken({
            priceOracle: address(new MockPriceOracle()),
            collateralRatio: 110
        });
        sbdToken = SBDToken(_sbdToken);
        shieldedSafes = IDoublyLinkedList(
            address(new OrderedDoublyLinkedList())
        );
        orderedReserveRatios = IDoublyLinkedList(
            address(new OrderedDoublyLinkedList())
        );
        orderedTargetShieldedRates = IDoublyLinkedList(
            address(new OrderedDoublyLinkedList())
        );
        reservePool = address(new ReservePool());
    }

    /**
     * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
     * Send any amount of ERC20 tokens or ETH
     *
     * @param _token Address of the ERC20 token, use address(0) for ETH
     * @param _amount Amount of tokens or ETH to deposit as collateral
     *
     */
    // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 _positionInReserve) external payable {
    // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 /*_positionInReserve*/) external payable {
    function openSafe(address _token, uint256 _amount) external payable {
        require(_amount > 0, "Amount must be greater than 0");
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);

        // Create a new Safe
        SBStructs.Safe memory safe = SBStructs.Safe({
            owner: msg.sender,
            token: _token,
            depositedAmount: _amount,
            borrowedAmount: 0,
            rates: 0,
            shieldedUntil: 0
        });

        // Deposit ETH or ERC20 token using SBUtils library
        if (_token == address(0)) {
            safe.depositedAmount = msg.value; // Assign ETH amount to depositedAmount
        } else {
            safe.depositedAmount = _amount; // Assign ERC20 amount to depositedAmount
        }
        SBUtils.depositEthOrToken(_token, address(this), _amount);

        // Add the Safe to the mapping
        safes[id] = safe;
    }

    /**
     * @dev Closes a Safe and returns the collateral to the owner.
     * Check if the borrowedAmount is 0, if there is any SB token borrowed, close should not work.
     * Return back the collateral
     * @param collateralToken ID of the Safe to close, derived from keccak256(msg.sender, _token)
     */
    function closeSafe(address collateralToken) external {
        bytes32 id = SBUtils.getSafeId(msg.sender, collateralToken);
        SBStructs.Safe storage safe = safes[id];
        require(
            safe.borrowedAmount == 0,
            "Cannot close Safe with borrowed amount"
        );

        // Withdraw ETH or ERC20 token using SBUtils library (Transfer collateral back to the owner)
        SBUtils.withdrawEthOrToken(
            safe.token,
            msg.sender,
            safe.depositedAmount
        );

        // Remove the Safe from the mapping
        delete safes[id];
    }

    /**
     * Borrow stablecoins from the protocol
     *
     * _borrowParams:
     * minimum: 36 bytes, maximum 68 bytes
     * bytes 0-3:
     *     bit: 0,1 borrowMode: 00 - shieldingRate, 01 - reserveRatio
     *     bits 2-15: rate (either shieldingRate or reserveRatio)
     *     bit 16,17: 1 if target shielding rate is set, 0 otherwise
     *     bits 18-31: target shielding rate
     * bytes 4-35: Nearest Spot in either shieldedSafes or orderedReserveRatiosList list
     * bytes 36-67: If exists, is always the nearest spot in the orderedTargetShieldedRatesList
     *
     */
    function borrowWithParams(
        address _token,
        uint256 _amount,
        bytes calldata _borrowParams
    ) external {
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);
        SBStructs.Safe memory safe = safes[id];
        require(safe.depositedAmount > 0, "Safe does not exist");
        bytes4 _rateByte = bytes4(_borrowParams[0:4]);
        uint32 _compressedRate = uint32(_rateByte);
        safe.rates = _compressedRate;
        SBStructs.BorrowMode _borrowMode = SBUtils.getBorrowMode(
            _compressedRate
        );
        //uint256 _nearestSpot = abi.decode(_borrowParams[4:32], (uint256));

        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[_token].priceOracle
        );

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.getPrice();

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = (safe.depositedAmount * price * 100) /
            liquidationRatio;

        // Check if the requested amount is within the maximum borrowable limits
        require(
            safe.borrowedAmount + _amount <= maxBorrowAmount,
            "Borrow amount exceeds the maximum allowed"
        );

        if (_borrowMode == SBStructs.BorrowMode.MINT_WITH_MANUAL_STABILITY) {
            handleBorrowReserveRatioSafes(
                id,
                safe,
                _compressedRate,
                _amount,
                _borrowParams
            );
        } else if (_borrowMode == SBStructs.BorrowMode.MINT_WITH_PROTECTION) {
            handleBorrowShieldedSafes(
                id,
                safe,
                _compressedRate,
                _amount,
                _borrowParams
            );
        } else if (_borrowMode == SBStructs.BorrowMode.BORROW_FROM_POOL) {
            // TODO: Implement borrow from pool
        }
        safes[id] = safe;
    }

    // borrow function
    function borrow(address _token, uint256 _amount) external {
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);
        SBStructs.Safe storage safe = safes[id];
        require(safe.depositedAmount > 0, "Safe does not exist");

        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[_token].priceOracle
        );

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.getPrice();

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = (safe.depositedAmount * price * 100) /
            liquidationRatio;

        // Check if the requested amount is within the maximum borrowable limit
        require(
            safe.borrowedAmount + _amount <= maxBorrowAmount,
            "Borrow amount exceeds the maximum allowed"
        );

        // Calculate origination fee
        uint256 originationFee = (_amount * originationFeeRateBasisPoints) /
            BASIS_POINTS_DIVISOR;

        // Update the Safe's borrowed amount and origination fee paid
        safe.borrowedAmount += _amount;
        //safe.originationFeePaid += originationFee;

        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amount - originationFee);
        // TODO: Mint origination fee to the fee holder
        //sbdToken.mint(feeHolder, originationFee);
    }

    // Repay function
    function repay(address _token, uint256 _amount) external {
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);
        SBStructs.Safe storage safe = safes[id];
        require(safe.borrowedAmount > 0, "No borrowed amount to repay");

        // Check if the repayment amount is valid
        require(
            _amount <= safe.borrowedAmount,
            "Repayment amount exceeds borrowed amount"
        );

        // Calculate the origination fee (assuming it's a percentage of the borrowed amount)
        uint256 originationFee = (safe.borrowedAmount *
            originationFeeRateBasisPoints) / BASIS_POINTS_DIVISOR;

        // Burn SBD tokens from the user to repay the borrowed amount
        sbdToken.burnFrom(msg.sender, _amount + originationFee);

        // Update the Safe's borrowed amount and origination fee paid
        safe.borrowedAmount -= _amount;
        // safe.originationFeePaid += originationFee;

        // Check if the borrowed amount is fully repaid
        if (safe.borrowedAmount == 0) {
            // Reset the borrowed amount and origination fee paid
            safe.borrowedAmount = 0;
            // safe.originationFeePaid = 0;
        }
    }

    // Withdraw collateral function
    function withdrawCollateral(address _token, uint256 _amount) external {
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);
        SBStructs.Safe storage safe = safes[id];
        require(safe.depositedAmount > 0, "No collateral to withdraw");

        if (safe.borrowedAmount > 0) {
            // Calculate the price of the collateral
            IPriceOracle priceOracle = IPriceOracle(
                whitelistedTokens[_token].priceOracle
            );
            uint256 price = priceOracle.getPrice();

            // Calculate the maximum withdrawal amount that maintains the liquidation ratio
            uint256 maxWithdrawal = safe.depositedAmount -
                (safe.borrowedAmount * liquidationRatio) /
                (price * 100);
            require(_amount <= maxWithdrawal, "Insufficient collateral");

            // Check if the remaining collateral is sufficient to cover the borrowed amount after withdrawal
            require(
                ((safe.depositedAmount - _amount) * price * 100) /
                    safe.borrowedAmount >=
                    liquidationRatio,
                "Insufficient collateral after withdrawal"
            );
        } else {
            // If there's no borrowed amount, ensure the withdrawal does not exceed deposited collateral
            require(_amount <= safe.depositedAmount, "Insufficient collateral");
        }

        // Withdraw ETH or ERC20 token using SBUtils library
        SBUtils.withdrawEthOrToken(safe.token, msg.sender, _amount);

        // Update the Safe's deposited amount
        safe.depositedAmount -= _amount;
    }

    function renewProtection(address _safe, uint256 _shieldingRate) public {
        // Only the owner can update the shielding rate
        require(
            msg.sender == owner,
            "Only the owner can update the shielding rate"
        );
        // Update the shielding rate for the safe
        shieldingRates[_safe] = _shieldingRate;
    }

    event SafeShielded(bytes32 safeId, address owner, uint256 shieldingUntil);

    function extendProtectionUntil(
        address _token,
        uint256 _shieldingUntil
    ) public {
        bytes32 safeId = SBUtils.getSafeId(msg.sender, _token);
        SBStructs.Safe storage safe = safes[safeId];
        require(safe.owner == msg.sender, "Safe does not exist");
        safe.shieldedUntil = _shieldingUntil;
        // shieldedSafes.insert(uint(safeId), 0, 0);
        IDoublyLinkedList(shieldedSafes).upsert(uint(safeId), 0, 0);
        emit SafeShielded(safeId, msg.sender, _shieldingUntil);
    }

    // Function to redeem SBD tokens for the underlying collateral

    function redeem(uint256 _amount, bytes calldata redemptionParams) external {
        require(_amount > 0, "Amount must be greater than 0");
        SBStructs.RedemptionToken[10] memory tokensList;
        SBStructs.Redemption memory redemption = SBStructs.Redemption({
            requestedAmount: _amount,
            redeemedAmount: 0,
            tokensList: tokensList,
            tokensCount: 0,
            processedSpots: 0
        });

        redemption = _redeemExpiredSafes(redemption);

        IDoublyLinkedList reserveRatioList = IDoublyLinkedList(
            orderedReserveRatios
        );
        IDoublyLinkedList targetShieldedRateList = IDoublyLinkedList(
            orderedTargetShieldedRates
        );
        redemption = _redeemSafesByTargetShieldingRate(
            redemption,
            redemptionParams,
            reserveRatioList,
            targetShieldedRateList
        );
        redemption = _redeemSafesByReserveRatio(
            redemption,
            redemptionParams,
            reserveRatioList,
            targetShieldedRateList
        );
        // A redemption should always happen.
        redemption = _redeemSafesNonExpired(redemption);

        _redeemToUser(redemption);
        //require(totalRedeemed == _amount, "Unable to redeem full amount");
        //sbdToken.burnFrom(msg.sender, _amount);

        // Return a success status
        return;
    }

    function renewShielding(address token, uint256 feeRate) external override {
        // TODO: Implement
    }
}
