/** @type import('hardhat/config').HardhatUserConfig */
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-solhint");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    eth_mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 1,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    "sepolia_network": {
      url: "https://rpc.sepolia.network",
      chainId: 5115,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    citreatestnet: {
      url: "https://rpc.testnet.citrea.xyz",
      chainId: 5115,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    localhost: {
      url: "http://127.0.0.1:8545",  // URL of the local Ethereum node
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",  // Default Hardhat mnemonic
      },
    },
  },
  gasReporter: {
    enabled: false
  },
  contractSizer: {
    runOnCompile: true, // Automatically display sizes after compile
    only: [], // Use an array of contract names if you want to limit the output
  },
};
