// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Structures.sol";
import "./Utilities.sol";
import "./SBDToken.sol";
import "./library/OrderedDoublyLinkedList.sol";
import "./interfaces/IDoublyLinkedList.sol";
import "./StableBase.sol";

contract StableBaseCDP is StableBase {
    constructor(
        address _sbdToken,
        address _priceOracle,
        address _stabilityPool,
        address _sbrTokenStaking
    ) StableBase(_sbdToken, _priceOracle, _stabilityPool, _sbrTokenStaking) {
        // Initialize the contract
        safesOrderedForLiquidation = new OrderedDoublyLinkedList();
        safesOrderedForRedemption = new OrderedDoublyLinkedList();
    }

    /**
     * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
     * Send any amount of ERC20 tokens or ETH
     *
     * @param _amount Amount of tokens or ETH to deposit as collateral
     * @param _safeId The ID of the Safe to create
     */

    function openSafe(uint256 _safeId, uint256 _amount) external payable {
        require(_amount > 0, "Amount must be greater than 0");
        require(msg.value == _amount, "Invalid amount");

        SBStructs.Safe memory safe = SBStructs.Safe({
            collateralAmount: _amount,
            borrowedAmount: 0,
            paidFeePercentage: 0,
            totalFeePaid: 0
        });
        LiquidationSnapshot memory liquidationSnapshot = LiquidationSnapshot({
            debtPerCollateralSnapshot: cumulativeDebtPerUnitCollateral,
            collateralPerCollateralSnapshot: cumulativeCollateralPerUnitCollateral
        });
        liquidationSnapshots[_safeId] = liquidationSnapshot;
        safes[_safeId] = safe;
        totalCollateral += _amount;

        _mint(msg.sender, _safeId); // mint the NFT Safe to the owner
        emit OpenSafe(_safeId, msg.sender, _amount);
    }

    /**
     * @dev Closes a Safe and returns the collateral to the owner.
     * Check if the borrowedAmount is 0, if there is any SB token borrowed, close should not work.
     * Return back the collateral
     * @param _safeId The ID of the Safe to close
     */
    function closeSafe(uint256 _safeId) external {
        SBStructs.Safe storage safe = safes[_safeId];
        _updateSafe(_safeId, safe);
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(
            safe.borrowedAmount == 0,
            "Cannot close Safe with borrowed amount"
        );
        uint256 collateralAmount = safe.collateralAmount;
        // Remove the Safe from the mapping
        delete safes[_safeId];

        _burn(_safeId); // burn the NFT Safe
        emit CloseSafe(_safeId);
        payable(msg.sender).transfer(collateralAmount);
    }

    /**
     * Borrow stablecoins from the protocol
     *
     */
    function borrow(
        uint256 _safeId,
        uint256 _amount,
        uint256 _shieldingRate,
        uint256 _nearestSpotInLiquidationQueue,
        uint256 _nearestSpotInRedemptionQueue
    ) external {
        SBStructs.Safe storage safe = safes[_safeId];
        _updateSafe(_safeId, safe);
        require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(safe.collateralAmount > 0, "Safe does not exist");

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.getPrice();

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = (safe.collateralAmount * price * 100) /
            liquidationRatio;

        // Check if the requested amount is within the maximum borrowable limits
        require(
            safe.borrowedAmount + _amount <= maxBorrowAmount,
            "Borrow amount exceeds the maximum allowed"
        );

        SBStructs.Safe memory _safe = safe;

        _safe = handleBorrow(
            _safeId,
            safe,
            _amount,
            _shieldingRate,
            _nearestSpotInLiquidationQueue,
            _nearestSpotInRedemptionQueue
        );
        safes[_safeId] = safe;

        // Emit the Borrow event
        emit Borrow(_safeId, _amount);
    }

    // Repay function
    function repay(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external {
        SBStructs.Safe storage _safe = safes[safeId];
        _updateSafe(safeId, _safe);
        require(_isApprovedOrOwner(msg.sender, safeId), "Unauthorized");
        require(_safe.borrowedAmount > 0, "No borrowed amount to repay");
        require(sbdToken.balanceOf(msg.sender) >= amount, "Insufficient SBD");

        // Check if the repayment amount is valid
        require(
            amount <= _safe.borrowedAmount,
            "Repayment amount exceeds borrowed amount"
        );
        sbdToken.burn(msg.sender, amount);
        _safe.borrowedAmount -= amount;
        uint256 _newRatio = ((_safe.borrowedAmount * PRECISION) /
            _safe.collateralAmount);
        safesOrderedForLiquidation.upsert(
            safeId,
            _newRatio,
            nearestSpotInLiquidationQueue
        );
    }

    function depositCollateral(
        uint256 safeId,
        uint256 amount
    ) external payable {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(_isApprovedOrOwner(msg.sender, safeId), "Unauthorized");
        require(safe.collateralAmount > 0, "Safe does not exist");
        require(msg.value == amount, "Invalid amount");

        safe.collateralAmount += amount;
        totalCollateral += amount;
    }

    // Withdraw collateral function
    function withdrawCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(_isApprovedOrOwner(msg.sender, safeId), "Unauthorized");
        require(safe.collateralAmount > 0, "No collateral to withdraw");

        if (safe.borrowedAmount > 0) {
            // Calculate the price of the collateral
            uint256 price = priceOracle.getPrice();

            // Calculate the maximum withdrawal amount that maintains the liquidation ratio
            uint256 maxWithdrawal = safe.collateralAmount -
                (safe.borrowedAmount * liquidationRatio) /
                (price * 100);
            require(amount <= maxWithdrawal, "Insufficient collateral");

            // Check if the remaining collateral is sufficient to cover the borrowed amount after withdrawal
            require(
                ((safe.collateralAmount - amount) * price * 100) /
                    safe.borrowedAmount >=
                    liquidationRatio,
                "Insufficient collateral after withdrawal"
            );
        } else {
            // If there's no borrowed amount, ensure the withdrawal does not exceed deposited collateral
            require(amount <= safe.collateralAmount, "Insufficient collateral");
        }

        // Update the Safe's deposited amount
        safe.collateralAmount -= amount;
        totalCollateral -= amount;
        // Withdraw ETH or ERC20 token using SBUtils library
        payable(msg.sender).transfer(amount);
    }

    // Function to redeem SBD tokens for the underlying collateral

    function redeem(uint256 _amount, bytes calldata redemptionParams) external {
        require(_amount > 0, "Amount must be greater than 0");
        sbdToken.burn(msg.sender, _amount);
        SBStructs.Redemption memory _redemption = SBStructs.Redemption({
            requestedAmount: _amount,
            redeemedAmount: 0,
            processedSpots: 0,
            collateralAmount: 0
        });

        _redemption = _redeemSafes(
            _redemption,
            redemptionParams,
            safesOrderedForRedemption,
            safesOrderedForLiquidation
        );
        _redeemToUser(_redemption);
        // Return a success status
        return;
    }

    function topup(
        uint256 safeId,
        uint256 feeRate,
        uint256 nearestSpotInRedemptionQueue
    ) external {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        //TODO:  Check if the required fee is paid
        require(feeRate > 0, "Fee rate must be greater than 0");
        uint256 balance = sbdToken.balanceOf(msg.sender);
        uint256 fee = (feeRate * safe.borrowedAmount) / BASIS_POINTS_DIVISOR;
        require(balance >= fee, "Insufficient SBD");
        require(_isApprovedOrOwner(msg.sender, safeId), "Unauthorized");
        // Update the spot in the shieldedSafes list
        safe.paidFeePercentage += feeRate;
        safesOrderedForRedemption.upsert(
            safeId,
            safe.paidFeePercentage,
            nearestSpotInRedemptionQueue
        );
        distributeFees(fee, false);
    }

    function liquidate() external {
        uint256 _safeId = safesOrderedForLiquidation.getHead();
        SBStructs.Safe storage safe = safes[_safeId];
        _updateSafe(_safeId, safe);
        //require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(safe.collateralAmount > 0, "Safe does not exist");
        require(
            safe.borrowedAmount > 0,
            "Cannot liquidate a Safe with no borrowed amount"
        );

        uint256 collateralPrice = priceOracle.getPrice();
        uint256 collateralValue = safe.collateralAmount * collateralPrice;
        uint256 collateralRatio = (collateralValue * 10000) /
            safe.borrowedAmount;
        // Check if the collateral is sufficient for liquidation
        require(
            collateralRatio < liquidationRatio * 100,
            "Can't liquidate yet"
        );
        bool possible = stabilityPool.isLiquidationPossible(
            safe.borrowedAmount
        );

        // Pay liquidation fee
        uint256 liquidationFee = (safe.collateralAmount *
            REDEMPTION_LIQUIDATION_FEE) / BASIS_POINTS_DIVISOR;

        if (possible) {
            stabilityPool.performLiquidation(
                safe.borrowedAmount,
                safe.collateralAmount - liquidationFee
            );
            // Burn the amount from stability pool
            sbdToken.burn(address(stabilityPool), safe.borrowedAmount);
            // Transfer the collateral to the liquidator
            payable(address(stabilityPool)).transfer(
                safe.collateralAmount - liquidationFee
            );
        } else {
            // Liquidate by distributing the debt and collateral to the existing borrowers.
            distributeDebtAndCollateral(
                safe.borrowedAmount,
                safe.collateralAmount
            );
        }
        safesOrderedForLiquidation.remove(_safeId);
        safesOrderedForRedemption.remove(_safeId);

        // Remove the Safe from the mapping
        delete safes[_safeId];
        // Send fee
        payable(msg.sender).transfer(liquidationFee);
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
