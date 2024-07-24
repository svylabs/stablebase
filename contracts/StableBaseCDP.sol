// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./Structures.sol";
import "./Utilities.sol";
import "./SBDToken.sol";

contract StableBaseCDP {
    uint256 private originationFeeRateBasisPoints = 0; // start with 0% origination fee
    uint256 private liquidationRatio = 110; // 110% liquidation ratio
    uint256 private constant BASIS_POINTS_DIVISOR = 10000;

    // Mapping to track Safe balances
    mapping(bytes32 => SBStructs.Safe) public safes;

    SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

    mapping(address => bool) public whitelistedTokens;

    // constructor() {
    //     // Add ETH to the whitelist
    //     whitelistedTokens[address(0)] = true;
    // }

    SBDToken public sbdToken;

    constructor(address _sbdToken) {
        whitelistedTokens[address(0)] = true;
        sbdToken = SBDToken(_sbdToken);
    }

    /**
     * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
     * Send any amount of ERC20 tokens or ETH
     *
     * @param _token Address of the ERC20 token, use address(0) for ETH
     * @param _amount Amount of tokens or ETH to deposit as collateral
     * @param _reserveRatio Reserve ratio specified by the user
     */
    // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 _positionInReserve) external payable {
    // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 /*_positionInReserve*/) external payable {
    function openSafe(address _token, uint256 _amount, uint256 _reserveRatio) external payable {
        require(_amount > 0, "Amount must be greater than 0");
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);

        // Create a new Safe
        SBStructs.Safe memory safe = SBStructs.Safe({
            token: _token,
            depositedAmount: _amount,
            borrowedAmount: 0,
            reserveRatio: _reserveRatio,
            originationFeePaid: 0
        });

        // Deposit ETH or ERC20 token using SBUtils library
        if (_token == address(0)) {
            require(msg.value == _amount, "Invalid deposit amount");
            safe.depositedAmount = msg.value; // Assign ETH amount to depositedAmount
        } else {
            SBUtils.depositEthOrToken(_token, address(this), _amount);
            safe.depositedAmount = _amount; // Assign ERC20 amount to depositedAmount
        }

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

    function borrow(address _token, uint256 _amount) external {
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);
        SBStructs.Safe storage safe = safes[id];
        require(safe.depositedAmount > 0, "Safe does not exist");

        // Fetch the price of the collateral from the oracle
        uint256 price = getPriceFromOracle(_token);

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = (safe.depositedAmount * price * 100) / liquidationRatio;

        // Check if the requested amount is within the maximum borrowable limit
        require(safe.borrowedAmount + _amount <= maxBorrowAmount, "Borrow amount exceeds the maximum allowed");

        // Calculate origination fee
        uint256 originationFee = (_amount * originationFeeRateBasisPoints) / BASIS_POINTS_DIVISOR;

        // Update the Safe's borrowed amount and origination fee paid
        safe.borrowedAmount += _amount;
        safe.originationFeePaid += originationFee;

        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amount - originationFee);
    }

    function getPriceFromOracle(address _token) internal view returns (uint256) {
        // Dummy implementation for fetching price from oracle
        return 1000; // For example, 1000 USD per ETH
    }
}
