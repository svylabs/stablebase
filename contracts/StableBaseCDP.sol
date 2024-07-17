pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// import "./Structures.sol";
// import "./Utilities.sol";

// contract StableBaseCDP {

//     uint256 private originationFeeRateBasisPoints = 0; // start with 0% origination fee
//     uint256 private liquidationRatio = 110; // 110% liquidation ratio

//     // Mapping to track Safe balances
//     mapping(address => SBStructs.Safe) public safes;

//     mapping(address => bool) public whitelistedTokens;

//     constructor() {
//         // Add ETH to the whitelist
//         whitelistedTokens[address(0)] = true;
//     }

//     /**
//      * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
//      */
//     function openSafe(uint256 id, address _token, uint256 _amount, uint256 _reserveRatio) external {
//         // Create a new Safe
//         SBStructs.Safe memory safe = SBStructs.Safe({
//             token: _token,
//             depositedAmount: _amount,
//             borrowedAmount: 0,
//             reserveRatio: _reserveRatio,
//             originationFeePaid: 0
//         });

//         // Add the Safe to the mapping
//         safes[msg.sender] = safe;

//         SBUtils.depositEthOrToken(_token, address(this), _amount);
//     }

//     function borrowFromSafe(uint256 id, uint256 _amount) external {
//         SBStructs.Safe storage safe = safes[msg.sender];

//         // Calculate origination fee
//         uint256 originationFee = SBUtils.percentage(_amount, originationFeeRateBasisPoints);
//         safe.originationFeePaid = safe.originationFeePaid + originationFee;

//         // Update borrowed amount
//         safe.borrowedAmount = safe.borrowedAmount + _amount;

//         // Transfer tokens to borrower
//         require(ERC20(safe.token).transfer(msg.sender, _amount), "Token transfer failed");
//     }

//     function repaySafe(uint256 _amount) external {
//         SBStructs.Safe storage safe = safes[msg.sender];

//         // Update borrowed amount
//         safe.borrowedAmount = safe.borrowedAmount - _amount;

//         // Transfer tokens from borrower
//         require(ERC20(safe.token).transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
//     }

//     function withdrawCollateral(uint256 _amount) external {
//         SBStructs.Safe storage safe = safes[msg.sender];

//         // Check if the Safe has enough collateral
//         require(safe.depositedAmount >= _amount, "Insufficient collateral");

//         // Update deposited amount
//         safe.depositedAmount = safe.depositedAmount - _amount;

//         // Transfer tokens to borrower
//         SBUtils.withdrawEthOrToken(safe.token, msg.sender, _amount);
//     }

//     function closeSafe(uint256 id) external {
//         SBStructs.Safe storage safe = safes[msg.sender];

//         // Check if the Safe is fully repaid
//         require(safe.borrowedAmount == 0, "Safe is not fully repaid");

//         // Transfer tokens to borrower
//         SBUtils.withdrawEthOrToken(safe.token, msg.sender, safe.depositedAmount);

//         // Remove the Safe from the mapping
//         delete safes[msg.sender];
//     }

//     function liquidateSafe(address _borrower) external {
//         SBStructs.Safe storage safe = safes[_borrower];

//         // Check if the Safe is undercollateralized
//         require(SBUtils.isUndercollateralized(safe, liquidationRatio), "Safe is not undercollateralized");

//         // Calculate the amount to liquidate
//         uint256 amountToLiquidate = SBUtils.calculateLiquidationAmount(safe, liquidationRatio);

//         // Update borrowed amount
//         safe.borrowedAmount = safe.borrowedAmount - amountToLiquidate;

//         // Transfer tokens from liquidator
//         require(ERC20(safe.token).transferFrom(msg.sender, address(this), amountToLiquidate), "Token transfer failed");

//         // Transfer tokens to liquidator
//         require(ERC20(safe.token).transfer(msg.sender, amountToLiquidate), "Token transfer failed");
//     }

//     function redeem(address _token, uint256 _amount) external {
//         // Transfer tokens to borrower
//         SBUtils.withdrawEthOrToken(_token, msg.sender, _amount);
//     }
// }

// // Mock Oracle contract
// contract Oracle {
//     function getPrice() external returns (uint256) {
//         // Mock implementation, should be replaced with real logic
//         return 2000; // Assuming Ethereum price is $2000 USD
//     }
// }

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./Structures.sol";
import "./Utilities.sol";

contract StableBaseCDP {

    uint256 private originationFeeRateBasisPoints = 0; // start with 0% origination fee
    uint256 private liquidationRatio = 110; // 110% liquidation ratio

    // Mapping to track Safe balances
    mapping(bytes32 => SBStructs.Safe) public safes;

    mapping(address => bool) public whitelistedTokens;

    constructor() {
        // Add ETH to the whitelist
        whitelistedTokens[address(0)] = true;
    }

    /**
     * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
     * Send any amount of ERC20 tokens or ETH
     * @param _token Address of the ERC20 token, use address(0) for ETH
     * @param _amount Amount of tokens or ETH to deposit as collateral
     * @param _reserveRatio Reserve ratio specified by the user
     */
    function openSafe(address _token, uint256 _amount, uint256 _reserveRatio) external payable {
        require(_amount > 0, "Amount must be greater than 0");
        bytes32 id = keccak256(abi.encodePacked(msg.sender, _token));

        // Create a new Safe
        SBStructs.Safe memory safe = SBStructs.Safe({
            token: _token,
            depositedAmount: _amount,
            borrowedAmount: 0,
            reserveRatio: _reserveRatio,
            originationFeePaid: 0
        });

        // Add the Safe to the mapping
        safes[id] = safe;

        // Deposit ETH or ERC20 token using SBUtils library
        SBUtils.depositEthOrToken{value: msg.value}(_token, address(this), _amount);
    }

    /**
     * @dev Closes a Safe and returns the collateral to the owner.
     * Check if the borrowedAmount is 0, if there is any SB token borrowed, close should not work.
     * Return back the collateral
     * @param id ID of the Safe to close, derived from keccak256(msg.sender, _token)
     */
    function closeSafe(bytes32 id) external {
        SBStructs.Safe storage safe = safes[id];
        require(safe.borrowedAmount == 0, "Cannot close Safe with borrowed amount");

        // Withdraw ETH or ERC20 token using SBUtils library (Transfer collateral back to the owner)
        SBUtils.withdrawEthOrToken(safe.token, msg.sender, safe.depositedAmount);

        // Remove the Safe from the mapping
        delete safes[id];
    }
}
