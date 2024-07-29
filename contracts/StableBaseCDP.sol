// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./Structures.sol";
import "./Utilities.sol";
import "./SBDToken.sol";
import "./dependencies/price-oracle/MockPriceOracle.sol";
import "./interfaces/IPriceOracle.sol";
import "./library/OrderedDoublyLinkedList.sol";

contract StableBaseCDP {
    uint256 private originationFeeRateBasisPoints = 0; // start with 0% origination fee
    uint256 private liquidationRatio = 110; // 110% liquidation ratio
    uint256 private constant BASIS_POINTS_DIVISOR = 10000;

    // Mapping to track Safe balances
    mapping(bytes32 => SBStructs.Safe) public safes;

    SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

    mapping(address => SBStructs.WhitelistedToken) public whitelistedTokens;

    SBDToken public sbdToken;

    address public orderedReserveList;

    address public orderedOriginationFeeList;

    constructor(address _sbdToken) {
        whitelistedTokens[address(0)] = SBStructs.WhitelistedToken({
            priceOracle: address(new MockPriceOracle()),
            collateralRatio: 110
        });
        sbdToken = SBDToken(_sbdToken);
        orderedReserveList = address(new OrderedDoublyLinkedList());
        orderedOriginationFeeList = address(new OrderedDoublyLinkedList());
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
        require(safe.borrowedAmount == 0, "Cannot close Safe with borrowed amount");

        // Withdraw ETH or ERC20 token using SBUtils library (Transfer collateral back to the owner)
        SBUtils.withdrawEthOrToken(safe.token, msg.sender, safe.depositedAmount);

        // Remove the Safe from the mapping
        delete safes[id];
    }

    // borrow function
    function borrow(address _token, uint256 _amount) external {
        bytes32 id = SBUtils.getSafeId(msg.sender, _token);
        SBStructs.Safe storage safe = safes[id];
        require(safe.depositedAmount > 0, "Safe does not exist");

        IPriceOracle priceOracle = IPriceOracle(whitelistedTokens[_token].priceOracle);

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.getPrice();

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
        // TODO: Mint origination fee to the fee holder
        //sbdToken.mint(feeHolder, originationFee);
    }

    // Repay function
    function repay(address _token, uint256 _amount) external {
    bytes32 id = SBUtils.getSafeId(msg.sender, _token);
    SBStructs.Safe storage safe = safes[id];
    require(safe.borrowedAmount > 0, "No borrowed amount to repay");

    // Calculate the amount to repay, including origination fee
    uint256 amountToRepay = _amount;
    uint256 originationFee = (amountToRepay * originationFeeRateBasisPoints) / BASIS_POINTS_DIVISOR;
    amountToRepay += originationFee;

    // Burn SBD tokens from the borrower
    sbdToken.burnFrom(msg.sender, amountToRepay);

    // Update the Safe's borrowed amount and origination fee paid
    safe.borrowedAmount -= _amount;
    safe.originationFeePaid += originationFee;

    // Check if the borrowed amount is fully repaid
    if (safe.borrowedAmount == 0) {
        // Reset the borrowed amount and origination fee paid
        safe.borrowedAmount = 0;
        safe.originationFeePaid = 0;
    }
    }

    // Withdraw collateral function
    function withdrawCollateral(address _token, uint256 _amount) external {
    bytes32 id = SBUtils.getSafeId(msg.sender, _token);
    SBStructs.Safe storage safe = safes[id];
    require(safe.depositedAmount > 0, "No collateral to withdraw");
    require(safe.borrowedAmount == 0, "Cannot withdraw collateral with outstanding borrow");

    // Calculate the amount to withdraw, ensuring it doesn't exceed the deposited amount
    uint256 amountToWithdraw = _amount;
    if (amountToWithdraw > safe.depositedAmount) {
        amountToWithdraw = safe.depositedAmount;
    }

    // Withdraw ETH or ERC20 token using SBUtils library
    SBUtils.withdrawEthOrToken(safe.token, msg.sender, amountToWithdraw);

    // Update the Safe's deposited amount
    safe.depositedAmount -= amountToWithdraw;
    }

    /**
 * @dev Redeem collateral for the specified amount of stablecoins.
 */
function redeem(uint256 amount) external {
    bytes32 id = SBUtils.getSafeId(msg.sender, address(0)); // assume ETH collateral for now
    SBStructs.Safe storage safe = safes[id];
    require(safe.depositedAmount > 0, "No collateral to redeem");
    require(safe.borrowedAmount == 0, "Cannot redeem collateral with outstanding borrow");

    // Calculate the amount of collateral to redeem
    uint256 collateralAmount = amount * liquidationRatio / BASIS_POINTS_DIVISOR;

    // Check if the user has sufficient collateral to redeem
    require(safe.depositedAmount >= collateralAmount, "Insufficient collateral to redeem");

    // Withdraw ETH collateral using SBUtils library
    SBUtils.withdrawEthOrToken(safe.token, msg.sender, collateralAmount);

    // Update the Safe's deposited amount
    safe.depositedAmount -= collateralAmount;

    // Mint SBD tokens to the user
    sbdToken.mint(msg.sender, amount);
}

}
