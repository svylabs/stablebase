// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
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
    constructor(
        address owner,
        address _sbdToken
    ) StableBase(_sbdToken) Ownable(owner) {
        // Initialize the contract
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
     * @param _safeId The ID of the Safe to create
     */

    function openSafe(
        uint256 _safeId,
        address _token,
        uint256 _amount
    ) external payable {
        require(_amount > 0, "Amount must be greater than 0");

        if (_token == address(0)) {
            // Handle ETH deposit
            require(msg.value == _amount, "Incorrect ETH amount sent");
            (bool success, ) = address(this).call{value: _amount}("");
            require(success, "ETH deposit failed");
        } else {
            // Handle ERC20 token deposit
            IERC20 token = IERC20(_token);
            require(
                token.transferFrom(msg.sender, address(this), _amount),
                "Token transfer failed"
            );
        }

        SBStructs.Safe memory safe = SBStructs.Safe({
            token: _token,
            depositedAmount: _amount,
            borrowedAmount: 0,
            rates: 0,
            shieldedUntil: 0
        });
        safes[_safeId] = safe;

        _mint(msg.sender, _safeId); // mint the NFT Safe to the owner
    }

    /**
     * @dev Closes a Safe and returns the collateral to the owner.
     * Check if the borrowedAmount is 0, if there is any SB token borrowed, close should not work.
     * Return back the collateral
     * @param _safeId The ID of the Safe to close
     */
    function closeSafe(uint256 _safeId) external onlyOwner {
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
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
        delete safes[_safeId];

        _burn(_safeId); // burn the NFT Safe
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
        uint256 _safeId,
        uint256 _amount,
        bytes calldata _borrowParams
    ) external {
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(safe.depositedAmount > 0, "Safe does not exist");
        bytes4 _rateByte = bytes4(_borrowParams[0:4]);
        uint32 _compressedRate = uint32(_rateByte);
        safe.rates = _compressedRate;
        SBStructs.BorrowMode _borrowMode = SBUtils.getBorrowMode(
            _compressedRate
        );
        //uint256 _nearestSpot = abi.decode(_borrowParams[4:32], (uint256));

        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[safe.token].priceOracle
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
                _safeId,
                safe,
                _compressedRate,
                _amount,
                _borrowParams
            );
        } else if (_borrowMode == SBStructs.BorrowMode.MINT_WITH_PROTECTION) {
            handleBorrowShieldedSafes(
                _safeId,
                safe,
                _compressedRate,
                _amount,
                _borrowParams
            );
        } else if (_borrowMode == SBStructs.BorrowMode.BORROW_FROM_POOL) {
            // TODO: Implement borrow from pool
        }
        safes[_safeId] = safe;
    }

    // borrow function
    function borrow(uint256 _safeId, uint256 _amount) external {
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(safe.depositedAmount > 0, "Safe does not exist");

        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[safe.token].priceOracle
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
    function repay(uint256 _safeId, uint256 _amount) external {
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
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
    function withdrawCollateral(uint256 _safeId, uint256 _amount) external {
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(safe.depositedAmount > 0, "No collateral to withdraw");

        if (safe.borrowedAmount > 0) {
            // Calculate the price of the collateral
            IPriceOracle priceOracle = IPriceOracle(
                whitelistedTokens[safe.token].priceOracle
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

    function renewProtection(
        uint256 _safeId,
        address _safe,
        uint256 _shieldingRate
    ) public {
        // Only the owner can update the shielding
        SBStructs.Safe storage safe = safes[_safeId];
        require(
            _isApprovedOrOwner(msg.sender, _safeId),
            "Only the owner can update the shielding rate"
        );
        // Update the shielding rate for the safe
        shieldingRates[_safe] = _shieldingRate;
    }

    event SafeShielded(uint256 safeId, address owner, uint256 shieldingUntil);

    function extendProtectionUntil(
        uint256 _safeId,
        uint256 _shieldingUntil
    ) public {
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        safe.shieldedUntil = _shieldingUntil;
        IDoublyLinkedList(shieldedSafes).upsert(uint(_safeId), 0, 0);
        emit SafeShielded(_safeId, msg.sender, _shieldingUntil);
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
        // Return a success status
        return;
    }

    function renewSafe(
        uint256 _safeId,
        uint256 feeRate,
        bytes calldata renewParams
    ) external {
        //TODO:  Check if the required fee is paid
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        safe.shieldedUntil = _getShieldingTime(feeRate, safe.shieldedUntil);
        safes[_safeId] = safe;
        uint256 nearestSpot = abi.decode(renewParams[0:32], (uint256));
        // Update the spot in the shieldedSafes list
        shieldedSafes.upsert(uint(_safeId), safe.shieldedUntil, nearestSpot);
        // Distribute the fee
    }

    function liquidate(uint256 _safeId) external {
        SBStructs.Safe storage safe = safes[_safeId];
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(safe.depositedAmount > 0, "Safe does not exist");
        require(
            safe.borrowedAmount > 0,
            "Cannot liquidate a Safe with no borrowed amount"
        );

        uint256 collateralValue = _getCollateralValue(safe);
        uint256 collateralRatio = (collateralValue * 10000) /
            safe.borrowedAmount;
        // Check if the collateral is sufficient for liquidation
        require(
            collateralRatio < liquidationRatio * 100,
            "Can't liquidate yet"
        );

        // Burn the borrowed amount from the user
        sbdToken.burnFrom(msg.sender, safe.borrowedAmount);

        // TODO: cleanup the safe from reservePool, ShieldedSafes, and targetShieldedRates, reservePool etc..

        // Transfer the collateral to the liquidator
        SBUtils.withdrawEthOrToken(
            safe.token,
            msg.sender,
            safe.depositedAmount
        );
        // TODO: Add liquidation fee

        // Remove the Safe from the mapping
        delete safes[_safeId];
    }

    function _isApprovedOrOwner(
        address _spender,
        uint256 _tokenId
    ) internal view returns (bool) {
        address owner = ownerOf(_tokenId);
        return (msg.sender == owner ||
            getApproved(_tokenId) == _spender ||
            isApprovedForAll(owner, _spender));
    }
}
