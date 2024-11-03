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
    constructor() StableBase() {}

    /**
     * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
     * Send any amount of ERC20 tokens or ETH
     *
     * @param _amount Amount of tokens or ETH to deposit as collateral
     * @param _safeId The ID of the Safe to create
     */

    function openSafe(uint256 _safeId, uint256 _amount) external payable {
        require(_amount > 0, "Amount must be greater than 0");
        require(msg.value == _amount, "Insufficient collateral");
        require(_safeId > 0, "Invalid Safe ID"); // To avoid race conditions somewhere in the code
        require(safes[_safeId].collateralAmount == 0, "Safe already exists");

        SBStructs.Safe memory safe = SBStructs.Safe({
            collateralAmount: _amount,
            borrowedAmount: 0,
            weight: 0,
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
     * @param safeId The ID of the Safe to close
     */
    function closeSafe(uint256 safeId) external _onlyOwner(safeId) {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(
            safe.borrowedAmount == 0,
            "Cannot close Safe with borrowed amount"
        );
        uint256 collateralAmount = safe.collateralAmount;
        // Remove the Safe from the mapping
        _removeSafe(safeId);
        emit CloseSafe(safeId);
        payable(msg.sender).transfer(collateralAmount);
    }

    /**
     * Borrow stablecoins from the protocol
     *
     */
    function borrow(
        uint256 safeId,
        uint256 amount,
        uint256 shieldingRate,
        uint256 nearestSpotInLiquidationQueue,
        uint256 nearestSpotInRedemptionQueue
    ) external _onlyOwner(safeId) {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "Safe does not exist");

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.getPrice();

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = (safe.collateralAmount *
            price *
            BASIS_POINTS_DIVISOR) / liquidationRatio;

        // Check if the requested amount is within the maximum borrowable limits
        require(
            safe.borrowedAmount + amount <= maxBorrowAmount,
            "Borrow amount exceeds the limit"
        );
        require(
            safe.borrowedAmount + amount >= MINIMUM_DEBT,
            "Invalid borrow amount"
        );

        handleBorrow(
            safeId,
            safe,
            amount,
            shieldingRate,
            nearestSpotInLiquidationQueue,
            nearestSpotInRedemptionQueue
        );

        // Emit the Borrow event
        emit Borrow(safeId, amount, safe.weight);
    }

    // Repay function
    function repay(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external _onlyOwner(safeId) {
        SBStructs.Safe storage _safe = safes[safeId];
        _updateSafe(safeId, _safe);
        require(_safe.borrowedAmount > 0, "No borrowed amount to repay");
        require(sbdToken.balanceOf(msg.sender) >= amount, "Insufficient SBD");

        // Check if the repayment amount is valid
        require(
            amount <= _safe.borrowedAmount,
            "Repayment amount exceeds borrowed amount"
        );
        require(
            _safe.borrowedAmount - amount == 0 ||
                _safe.borrowedAmount - amount >= MINIMUM_DEBT,
            "Invalid repayment amount"
        );
        sbdToken.burn(msg.sender, amount);
        _safe.borrowedAmount -= amount;
        uint256 _newRatio = _safe.borrowedAmount / _safe.collateralAmount;
        if (_newRatio != 0) {
            safesOrderedForLiquidation.upsert(
                safeId,
                _newRatio,
                nearestSpotInLiquidationQueue
            );
        } else {
            safesOrderedForLiquidation.remove(safeId);
            safesOrderedForRedemption.remove(safeId);
        }
        totalDebt -= amount;
    }

    function addCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external payable _onlyOwner(safeId) {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "Safe does not exist");
        require(msg.value == amount, "Invalid amount");

        safe.collateralAmount += amount;
        totalCollateral += amount;

        uint256 _newRatio = safe.borrowedAmount / safe.collateralAmount;
        safesOrderedForLiquidation.upsert(
            safeId,
            _newRatio,
            nearestSpotInLiquidationQueue
        );

        emit AddedCollateral(safeId, amount);
    }

    // Withdraw collateral function
    function withdrawCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external _onlyOwner(safeId) {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "No collateral to withdraw");

        if (safe.borrowedAmount > 0) {
            // Calculate the price of the collateral
            uint256 price = priceOracle.getPrice();

            // Calculate the maximum withdrawal amount that maintains the liquidation ratio
            uint256 maxWithdrawal = safe.collateralAmount -
                (safe.borrowedAmount * liquidationRatio) /
                (price * BASIS_POINTS_DIVISOR);
            require(amount <= maxWithdrawal, "Insufficient collateral");
            uint256 _newRatio = safe.borrowedAmount /
                (safe.collateralAmount - amount);
            safesOrderedForLiquidation.upsert(
                safeId,
                _newRatio,
                nearestSpotInLiquidationQueue
            );
        } else {
            // If there's no borrowed amount, ensure the withdrawal does not exceed deposited collateral
            require(amount <= safe.collateralAmount, "Insufficient collateral");
            safesOrderedForLiquidation.remove(safeId);
            safesOrderedForRedemption.remove(safeId);
        }

        // Update the Safe's deposited amount
        safe.collateralAmount -= amount;
        totalCollateral -= amount;

        // Withdraw ETH or ERC20 token using SBUtils library
        payable(msg.sender).transfer(amount);
    }

    // Function to redeem SBD tokens for the underlying collateral

    function redeem(uint256 amount, bytes calldata redemptionParams) external {
        require(amount > 0, "Amount must be greater than 0");
        sbdToken.burn(msg.sender, amount);
        SBStructs.Redemption memory _redemption = SBStructs.Redemption({
            requestedAmount: amount,
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
        totalCollateral -= _redemption.collateralAmount;
        totalDebt -= _redemption.redeemedAmount;
        // Return a success status
        return;
    }

    function feeTopup(
        uint256 safeId,
        uint256 topupRate,
        uint256 nearestSpotInRedemptionQueue
    ) external _onlyOwner(safeId) {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        //TODO:  Check if the required fee is paid
        require(topupRate > 0, "Fee rate must be greater than 0");
        uint256 balance = sbdToken.balanceOf(msg.sender);
        uint256 fee = (topupRate * safe.borrowedAmount) / BASIS_POINTS_DIVISOR;
        require(balance >= fee, "Insufficient Balance to pay fee");
        // Update the spot in the shieldedSafes list
        safe.weight += topupRate;
        sbdToken.transferFrom(msg.sender, address(this), fee);
        // Jump to the correct position in the redemption queue
        safesOrderedForRedemption.upsert(
            safeId,
            safe.weight,
            nearestSpotInRedemptionQueue
        );
        (, uint256 refundFee) = distributeFees(fee, false);
        if (refundFee > 0) {
            // Refund undistributed fee back to the user
            sbdToken.transfer(msg.sender, refundFee);
        }
        emit FeeTopup(safeId, topupRate, fee, safe.weight);
    }

    function liquidate() external {
        uint256 _safeId = safesOrderedForLiquidation.getTail();
        SBStructs.Safe storage safe = safes[_safeId];
        _updateSafe(_safeId, safe);
        uint256 borrowedAmount = safe.borrowedAmount;
        uint256 collateralAmount = safe.collateralAmount;
        //require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(collateralAmount > 0, "Safe does not exist");
        require(
            borrowedAmount > 0,
            "Cannot liquidate a Safe with no borrowed amount"
        );

        uint256 collateralPrice = priceOracle.getPrice();
        uint256 collateralValue = collateralAmount * collateralPrice;
        uint256 collateralRatio = (collateralValue * BASIS_POINTS_DIVISOR) /
            borrowedAmount;
        // Check if the collateral is sufficient for liquidation
        require(collateralRatio <= liquidationRatio, "Can't liquidate yet");
        bool possible = stabilityPool.isLiquidationPossible(borrowedAmount);

        // Pay liquidation fee
        uint256 liquidationFee = (collateralAmount *
            REDEMPTION_LIQUIDATION_FEE) / BASIS_POINTS_DIVISOR;

        totalCollateral -= collateralAmount;
        totalDebt -= borrowedAmount;

        if (possible) {
            stabilityPool.performLiquidation(
                borrowedAmount,
                collateralAmount - liquidationFee
            );
            // Burn the amount from stability pool
            sbdToken.burn(address(stabilityPool), borrowedAmount);
            // Transfer the collateral to the liquidator
            payable(address(stabilityPool)).transfer(
                collateralAmount - liquidationFee
            );
        } else {
            // Liquidate by distributing the debt and collateral to the existing borrowers.
            distributeDebtAndCollateral(
                borrowedAmount,
                collateralAmount - liquidationFee,
                totalCollateral
            );
        }
        safesOrderedForLiquidation.remove(_safeId);
        safesOrderedForRedemption.remove(_safeId);

        // Remove the Safe from the mapping
        _removeSafe(_safeId);
        // Send fee
        payable(msg.sender).transfer(liquidationFee);
    }

    function adjustPosition(uint256 safeId) external _onlyOwner(safeId) {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "Safe does not exist");
        uint256 _newRatio = safe.borrowedAmount / safe.collateralAmount;
        safesOrderedForLiquidation.upsert(safeId, _newRatio, 0);
    }

    modifier _onlyOwner(uint256 _tokenId) {
        address owner = ownerOf(_tokenId);
        require(msg.sender == owner, "Not the owner");
        _;
    }
}
