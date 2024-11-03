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
        delete safes[safeId];

        _burn(safeId); // burn the NFT Safe
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
        sbdToken.burn(msg.sender, amount);
        _safe.borrowedAmount -= amount;
        uint256 _newRatio = ((_safe.borrowedAmount * PRECISION) /
            _safe.collateralAmount);
        safesOrderedForLiquidation.upsert(
            safeId,
            _newRatio,
            nearestSpotInLiquidationQueue
        );
        totalDebt -= amount;
    }

    function depositCollateral(
        uint256 safeId,
        uint256 amount
    ) external payable _onlyOwner(safeId) {
        SBStructs.Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
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
        totalCollateral -= safe.collateralAmount;
        totalDebt -= safe.borrowedAmount;
    }

    modifier _onlyOwner(uint256 _tokenId) {
        address owner = ownerOf(_tokenId);
        require(msg.sender == owner, "Not the owner");
        _;
    }
}
