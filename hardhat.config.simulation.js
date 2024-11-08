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
            runs: 300,
          },
          viaIR: true,
        },
      },
  networks: {
    hardhat: {
      accounts: {
        count: 500, // Adjust this number for hundreds of accounts
        initialBalance: "1000000000000000000000" // 1000 ETH per account
      }
    }
  },
  contractSizer: {
    runOnCompile: true, // Automatically display sizes after compile
    only: [], // Use an array of contract names if you want to limit the output
  },
};
