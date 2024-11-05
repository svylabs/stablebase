pragma solidity ^0.8.20;

import "../../interfaces/IPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockPriceOracle is IPriceOracle, Ownable {
    uint256 public price = 70000;

    constructor() Ownable(msg.sender) {}

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
    }

    function getPrice() external view override returns (uint256) {
        return price;
    }
}
