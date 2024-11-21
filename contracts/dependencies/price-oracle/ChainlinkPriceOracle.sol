// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../interfaces/IPriceOracle.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract ChainlinkPriceFeed is IPriceOracle {
    AggregatorV3Interface internal priceFeed;

    /**
     * Constructor to initialize the Chainlink price feed based on the chain ID.
     * @param chainId The chain ID to set the appropriate price feed address.
     */
    constructor(uint256 chainId) {
        if (chainId == 1) {
            // Ethereum Mainnet
            priceFeed = AggregatorV3Interface(
                0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
            );
        } else if (chainId == 11155111) {
            // Sepolia Testnet
            priceFeed = AggregatorV3Interface(
                0x694AA1769357215DE4FAC081bf1f309aDC325306
            );
        } else if (chainId == 5) {
            // Goerli Testnet (if needed)
            priceFeed = AggregatorV3Interface(
                0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e
            );
        } else {
            revert("Unsupported chain ID");
        }
    }

    function lastGoodPrice() public view override returns (uint256) {
        return fetchPrice();
    }

    /**
     * Fetches the latest ETH/USD price scaled to 10^18.
     */
    function fetchPrice() public view returns (uint256) {
        (
            ,
            /* uint80 roundID */ int256 price /* uint startedAt */ /* uint timeStamp */ /* uint80 answeredInRound */,
            ,
            ,

        ) = priceFeed.latestRoundData();

        require(price > 0, "Invalid price data");

        // Scale the price from 10^8 to 10^18
        return uint256(price) * 10 ** 10;
    }
}
