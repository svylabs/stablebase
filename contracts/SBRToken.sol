// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SBRToken is ERC20 {
    address public minter;

    // Optional: Variable to track total burned tokens
    uint256 public totalBurned;

    // Event for burning tokens
    event Burn(address indexed from, uint256 amount);

    constructor() ERC20("StableBase Revenue", "SBR") {
        minter = msg.sender;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Only minter can mint");
        _mint(to, amount);
    }

    function setMinter(address newMinter) external {
        require(msg.sender == minter, "Only minter can set new minter");
        minter = newMinter;
    }

    function burn(address from, uint256 amount) external {
        require(from != address(0), "Invalid address");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(from) >= amount, "Insufficient balance");

        _burn(from, amount); // Using OpenZeppelin's internal _burn function

        totalBurned += amount;

        emit Burn(from, amount);
    }
}
