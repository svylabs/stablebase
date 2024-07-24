pragma solidity ^0.8.20;

import "../../interfaces/IPriceOracle.sol";

contract ChainlinkPriceOracle is IPriceOracle {

    function getPrice() external view override returns (uint256) {
        // write implementation for chainlink price oracle here
        return 1000;
    }

}