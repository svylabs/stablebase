// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Structures.sol";
import "./StableBase.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StableBaseCDP is StableBase, ReentrancyGuard {
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
        require(_ownerOf(_safeId) == address(0), "Safe already exists");

        Safe memory safe = Safe({
            collateralAmount: _amount,
            borrowedAmount: 0,
            weight: 0,
            status: SafeStatus.OPEN,
            feePaid: 0
        });
        LiquidationSnapshot memory liquidationSnapshot = LiquidationSnapshot({
            debtPerCollateralSnapshot: cumulativeDebtPerUnitCollateral,
            collateralPerCollateralSnapshot: cumulativeCollateralPerUnitCollateral
        });
        liquidationSnapshots[_safeId] = liquidationSnapshot;
        safes[_safeId] = safe;
        totalCollateral += _amount;

        _mint(msg.sender, _safeId); // mint the NFT Safe to the owner
        emit OpenSafe(_safeId, msg.sender, _amount, totalCollateral, totalDebt);
    }

    /**
     * @dev Closes a Safe and returns the collateral to the owner.
     * Check if the borrowedAmount is 0, if there is any SB token borrowed, close should not work.
     * Return back the collateral
     * @param safeId The ID of the Safe to close
     */
    function closeSafe(uint256 safeId) external _onlyOwner(safeId) {
        Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(
            safe.borrowedAmount == 0,
            "Cannot close Safe with borrowed amount"
        );
        uint256 collateralAmount = safe.collateralAmount;
        totalCollateral -= collateralAmount; // Should we need this or not
        // Remove the Safe from the mapping
        _removeSafe(safeId);
        emit SafeClosed(safeId, collateralAmount, totalCollateral, totalDebt);
        (bool success, ) = msg.sender.call{value: collateralAmount}("");
        require(success, "Transfer failed");
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
        Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "Safe does not exist");

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.fetchPrice();

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = ((
            (safe.collateralAmount * price * BASIS_POINTS_DIVISOR)
        ) / liquidationRatio) / PRECISION;

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
    }

    // Repay function
    function repay(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external _onlyOwner(safeId) {
        Safe storage _safe = safes[safeId];
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
            IDoublyLinkedList.Node memory node = safesOrderedForLiquidation
                .upsert(safeId, _newRatio, nearestSpotInLiquidationQueue);
            emit LiquidationQueueUpdated(safeId, _newRatio, node.next);
        } else {
            _removeSafeFromBothQueues(safeId);
        }
        _updateTotalDebt(totalDebt, amount, false);
        emit Repaid(safeId, amount, _newRatio, totalCollateral, totalDebt);
    }

    function addCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external payable _onlyOwner(safeId) {
        Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "Safe does not exist");
        require(msg.value == amount, "Invalid amount");

        safe.collateralAmount += amount;
        totalCollateral += amount;

        uint256 _newRatio = safe.borrowedAmount / safe.collateralAmount;
        IDoublyLinkedList.Node memory node = safesOrderedForLiquidation.upsert(
            safeId,
            _newRatio,
            nearestSpotInLiquidationQueue
        );
        emit LiquidationQueueUpdated(safeId, _newRatio, node.next);

        emit AddedCollateral(
            safeId,
            amount,
            _newRatio,
            totalCollateral,
            totalDebt
        );
    }

    // Withdraw collateral function
    function withdrawCollateral(
        uint256 safeId,
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external _onlyOwner(safeId) {
        Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "No collateral to withdraw");

        if (safe.borrowedAmount > 0) {
            // Calculate the price of the collateral
            uint256 price = priceOracle.fetchPrice();

            // Calculate the maximum withdrawal amount that maintains the liquidation ratio
            uint256 maxWithdrawal = safe.collateralAmount -
                (safe.borrowedAmount * liquidationRatio * PRECISION) /
                (price * BASIS_POINTS_DIVISOR);
            require(amount <= maxWithdrawal, "Insufficient collateral");
            uint256 _newRatio = safe.borrowedAmount /
                (safe.collateralAmount - amount);
            IDoublyLinkedList.Node memory node = safesOrderedForLiquidation
                .upsert(safeId, _newRatio, nearestSpotInLiquidationQueue);
            emit LiquidationQueueUpdated(safeId, _newRatio, node.next);
        } else {
            // If there's no borrowed amount, ensure the withdrawal does not exceed deposited collateral
            require(amount <= safe.collateralAmount, "Insufficient collateral");
            _removeSafeFromBothQueues(safeId);
        }

        // Update the Safe's deposited amount
        safe.collateralAmount -= amount;
        totalCollateral -= amount;
        emit WithdrawnCollateral(safeId, amount, totalCollateral, totalDebt);

        // Withdraw ETH or ERC20 token using SBUtils library
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    // Function to redeem SBD tokens for the underlying collateral
    function redeem(
        uint256 amount,
        uint256 nearestSpotInLiquidationQueue
    ) external onlyInNormalMode {
        require(amount > 0, "Amount must be greater than 0");
        require(
            sbdToken.transferFrom(msg.sender, address(this), amount),
            "Unable to transfer SBD"
        );
        uint256 price = priceOracle.fetchPrice();
        uint256 redemptionId = uint256(
            keccak256(
                abi.encode(
                    msg.sender,
                    amount,
                    block.number,
                    safesOrderedForRedemption.getHead()
                )
            )
        );

        SBStructs.Redemption memory _redemption = SBStructs.Redemption({
            redemptionId: redemptionId,
            requestedAmount: amount,
            price: price,
            redeemedAmount: 0,
            refundedAmount: 0,
            processedSpots: 0,
            collateralAmount: 0,
            ownerFee: 0,
            redeemerFee: 0
        });

        _redemption = _redeemSafes(_redemption, nearestSpotInLiquidationQueue);
        _redeemToUser(_redemption);
        totalCollateral -= _redemption.collateralAmount;
        //totalDebt -= _redemption.redeemedAmount;
        _updateTotalDebt(
            totalDebt,
            _redemption.redeemedAmount - _redemption.refundedAmount,
            false
        );
        require(
            sbdToken.burn(
                address(this),
                _redemption.redeemedAmount - _redemption.refundedAmount
            ),
            "Burn failed"
        );

        emit RedeemedBatch(
            redemptionId,
            amount,
            _redemption.collateralAmount,
            totalCollateral,
            totalDebt
        );
    }

    function feeTopup(
        uint256 safeId,
        uint256 topupRate,
        uint256 nearestSpotInRedemptionQueue
    ) external _onlyOwner(safeId) {
        Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        //TODO:  Check if the required fee is paid
        require(topupRate > 0, "Fee rate must be greater than 0");
        uint256 balance = sbdToken.balanceOf(msg.sender);
        uint256 fee = (topupRate * safe.borrowedAmount) / BASIS_POINTS_DIVISOR;
        require(balance >= fee, "Insufficient Balance to pay fee");
        // Update the spot in the shieldedSafes list
        safe.weight += topupRate;
        safe.feePaid += fee;
        require(
            sbdToken.transferFrom(msg.sender, address(this), fee),
            "Transfering Tokens failed"
        );
        // Jump to the correct position in the redemption queue
        IDoublyLinkedList.Node memory node = safesOrderedForRedemption.upsert(
            safeId,
            safe.weight,
            nearestSpotInRedemptionQueue
        );
        emit RedemptionQueueUpdated(safeId, safe.weight, node.prev);
        (, uint256 refundFee) = distributeFees(safeId, fee, false);
        if (refundFee > 0) {
            // Refund undistributed fee back to the user
            require(
                sbdToken.transfer(msg.sender, refundFee),
                "Transfer Refund failed"
            );
            emit FeeRefund(safeId, refundFee);
        }
        emit FeeTopup(safeId, topupRate, fee, safe.weight);
    }

    function liquidate() external nonReentrant {
        uint256 gasStart = gasleft();
        uint256 _safeId = safesOrderedForLiquidation.getTail();
        uint256 _last = safesOrderedForLiquidation.getHead();
        Safe storage safe = safes[_safeId];
        _updateSafe(_safeId, safe);
        uint256 borrowedAmount = safe.borrowedAmount;
        uint256 collateralAmount = safe.collateralAmount;
        //require(_isApprovedOrOwner(msg.sender, _safeId), "Unauthorized");
        require(collateralAmount > 0, "Safe does not exist");
        require(
            borrowedAmount > 0,
            "Cannot liquidate a Safe with no borrowed amount"
        );

        uint256 collateralPrice = priceOracle.fetchPrice();
        uint256 collateralValue = (collateralAmount * collateralPrice) /
            PRECISION;
        uint256 collateralRatio = (collateralValue * BASIS_POINTS_DIVISOR) /
            borrowedAmount;
        // Check if the collateral is sufficient for liquidation
        require(collateralRatio <= liquidationRatio, "Can't liquidate yet");
        bool possible = stabilityPool.isLiquidationPossible(borrowedAmount);

        // Pay liquidation fee
        uint256 liquidationFee = (collateralAmount *
            REDEMPTION_LIQUIDATION_FEE) / BASIS_POINTS_DIVISOR;

        totalCollateral -= collateralAmount;
        _updateTotalDebt(totalDebt, borrowedAmount, false);

        if (possible) {
            require(
                stabilityPool.performLiquidation{
                    value: collateralAmount - liquidationFee
                }(borrowedAmount, collateralAmount - liquidationFee),
                "Liquidation failed"
            );
            // Burn the amount from stability pool
            require(
                sbdToken.burn(address(stabilityPool), borrowedAmount),
                "Burn failed"
            );

            emit LiquidatedUsingStabilityPool(
                _safeId,
                borrowedAmount,
                collateralAmount,
                totalCollateral,
                totalDebt
            );
        } else {
            require(_safeId != _last, "Cannot liquidate the last Safe");
            // Liquidate by distributing the debt and collateral to the existing borrowers.
            distributeDebtAndCollateral(
                borrowedAmount,
                collateralAmount - liquidationFee,
                totalCollateral
            );
            emit LiquidatedUsingSecondaryMechanism(
                _safeId,
                borrowedAmount,
                collateralAmount,
                totalCollateral,
                totalDebt
            );
        }
        _removeSafeFromBothQueues(_safeId);

        // Remove the Safe from the mapping
        _removeSafe(_safeId);
        uint256 gasUsed = gasStart - gasleft();
        uint256 gasCompensation = (gasUsed + 100000) *
            (block.basefee + (block.basefee * 10) / 100); // 10% extra gas cost
        uint256 refund = min(gasCompensation, liquidationFee);
        _distributeLiquidationFeeAndGasCompensation(
            _safeId,
            liquidationFee,
            refund
        );
    }

    function _distributeLiquidationFeeAndGasCompensation(
        uint256 safeId,
        uint256 liquidationFee,
        uint256 refund
    ) internal {
        // Try to send the liquidation fee to sbr stakers
        if (liquidationFee > refund) {
            if (sbrStakingPoolCanReceiveRewards) {
                bool success = sbrTokenStaking.addCollateralReward{
                    value: liquidationFee - refund
                }(liquidationFee - refund);
                if (!success && stabilityPoolCanReceiveRewards) {
                    success = stabilityPool.addCollateralReward{
                        value: liquidationFee - refund
                    }(liquidationFee - refund);
                    if (!success) {
                        refund = liquidationFee;
                    }
                } else if (success) {
                    emit LiquidationFeePaid(
                        safeId,
                        address(sbrTokenStaking),
                        liquidationFee - refund
                    );
                }
            } else if (stabilityPoolCanReceiveRewards) {
                bool success = stabilityPool.addCollateralReward{
                    value: liquidationFee - refund
                }(liquidationFee - refund);
                if (!success) {
                    refund = liquidationFee;
                } else {
                    emit LiquidationFeePaid(
                        safeId,
                        address(stabilityPool),
                        liquidationFee - refund
                    );
                }
            } else {
                refund = liquidationFee;
            }
        }
        if (refund > 0) {
            // Refund the remaining liquidation fee to the user
            (bool success, ) = msg.sender.call{value: refund}("");
            require(success, "Transfer failed");
            emit LiquidationGasCompensationPaid(safeId, msg.sender, refund);
        }
    }

    function adjustPosition(
        uint256 safeId,
        uint256 nearestSpotInLiquidationQueue
    ) external _onlyOwner(safeId) {
        Safe storage safe = safes[safeId];
        _updateSafe(safeId, safe);
        require(safe.collateralAmount > 0, "Safe does not exist");
        uint256 _newRatio = safe.borrowedAmount / safe.collateralAmount;
        IDoublyLinkedList.Node memory node = safesOrderedForLiquidation.upsert(
            safeId,
            _newRatio,
            nearestSpotInLiquidationQueue
        );
        emit LiquidationQueueUpdated(safeId, _newRatio, node.next);
    }

    modifier _onlyOwner(uint256 _tokenId) {
        address owner = ownerOf(_tokenId);
        require(msg.sender == owner, "Not the owner");
        _;
    }

    function updateTokenURI(
        uint256 tokenId,
        string memory newTokenURI
    ) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not authorized");
        _setTokenURI(tokenId, newTokenURI);
    }

    function _isApprovedOrOwner(
        address spender,
        uint256 tokenId
    ) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || getApproved(tokenId) == spender);
    }
}
