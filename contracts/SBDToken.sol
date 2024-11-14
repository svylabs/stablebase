// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SBDToken is ERC20, Ownable {
    // Optional: Variable to track total burned tokens
    uint256 public totalBurned;

    // Event for burning tokens
    event Burn(address indexed from, uint256 amount);

    constructor() Ownable(msg.sender) ERC20("StableBase USD", "SBUSD") {}

    function setAddresses(address _stableBaseCDP) external onlyOwner {
        transferOwnership(_stableBaseCDP);
    }

    function mint(
        address to,
        uint256 amount
    ) external onlyOwner returns (bool) {
        _mint(to, amount);
        return true;
    }

    function burn(
        address from,
        uint256 amount
    ) external onlyOwner returns (bool) {
        require(from != address(0), "Invalid address");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(from) >= amount, "Insufficient balance");

        _burn(from, amount); // Using OpenZeppelin's internal _burn function

        totalBurned += amount;

        emit Burn(from, amount);
        return true;
    }
}
