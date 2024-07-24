pragma solidity ^0.8.20;

import "../../interfaces/IPriceOracle.sol";

contract MockPriceOracle is IPriceOracle {

    function getPrice() external view override returns (uint256) {
        return 1000;
    }

}