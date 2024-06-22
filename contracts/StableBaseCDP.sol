pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./Structures.sol";
import "./Utilities.sol";

contract StableBaseCDP {

    uint256 private originationFeeRateBasisPoints = 0; // start with 0% origination fee
    uint256 private liquidationRatio = 110; // 110% liquidation ratio

    // Mapping to track Safe balances
    mapping(address => SBStructs.Safe) public safes;

    mapping(address => bool) public whitelistedTokens;

    constructor() {
        // Add ETH to the whitelist
        whitelistedTokens[address(0)] = true;
    }

    function openSafe(uint256 id, address _token, uint256 _amount, uint256 _reserveRatio) external {
        // Create a new Safe
        SBStructs.Safe memory safe = SBStructs.Safe({
            token: _token,
            depositedAmount: _amount,
            borrowedAmount: 0,
            reserveRatio: _reserveRatio,
            originationFeePaid: 0
        });

        // Add the Safe to the mapping
        safes[msg.sender] = safe;

        SBUtils.depositEthOrToken(_token, address(this), _amount);
    }

    function borrowFromSafe(uint256 _amount) external {
        SBStructs.Safe storage safe = safes[msg.sender];

        // Calculate origination fee
        uint256 originationFee = SBUtils.percentage(_amount, originationFeeRateBasisPoints);
        safe.originationFeePaid = safe.originationFeePaid + originationFee;

        // Update borrowed amount
        safe.borrowedAmount = safe.borrowedAmount + _amount;

        // Transfer tokens to borrower
        require(ERC20(safe.token).transfer(msg.sender, _amount), "Token transfer failed");
    }
}

// Mock Oracle contract
contract Oracle {
    function getPrice() external returns (uint256) {
        // Mock implementation, should be replaced with real logic
        return 2000; // Assuming Ethereum price is $2000 USD
    }
}
