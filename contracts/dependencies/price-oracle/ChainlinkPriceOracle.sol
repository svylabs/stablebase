// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../interfaces/IPriceOracle.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract ChainlinkPriceOracle is IPriceOracle {
    AggregatorV3Interface internal priceFeed;

    /**
     * @dev Sets the address of the Chainlink price feed contract.
     * @param _priceFeedAddress Address of the Chainlink price feed contract.
     */
    constructor(address _priceFeedAddress) {
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
    }

    /**
     * @dev Returns the latest price from the Chainlink price feed.
     * @return The price as a uint256.
     */
    function fetchPrice() external view override returns (uint256) {
        (, /*uint80 roundID*/ int price, , , ) = /*uint startedAt*/ /*uint timeStamp*/ /*uint80 answeredInRound*/
        priceFeed.latestRoundData();
        // (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        return uint256(price);
    }
}
