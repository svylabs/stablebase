pragma solidity ^0.8.20;

import "../../interfaces/IPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockPriceOracle is IPriceOracle, Ownable {
    uint256 public price = 120000 * 1e18;

    constructor() Ownable(msg.sender) {}

    function setPrice(uint256 _price) external onlyOwner {
        price = _price * 1e18;
    }

    function lastGoodPrice() external view override returns (uint256) {
        return price;
    }

    function fetchPrice() external view override returns (uint256) {
        return price;
    }
}
