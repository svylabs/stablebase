/** @type import('hardhat/config').HardhatUserConfig */
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-solhint");
require("hardhat-gas-reporter");

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
    localhost: {
      url: "http://127.0.0.1:8545",  // URL of the local Ethereum node
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",  // Default Hardhat mnemonic
      },
    },
  },
  gasReporter: {
    enabled: false
  }
};
