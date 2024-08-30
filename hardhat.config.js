// /** @type import('hardhat/config').HardhatUserConfig */
// require("@nomicfoundation/hardhat-toolbox");
// require("@nomiclabs/hardhat-solhint");

// module.exports = {
//   solidity: {
//     version: "0.8.20",
//     settings: {
//       optimizer: {
//         enabled: true,
//         runs: 200,
//       },
//       viaIR: true,
//     },
//   },
//   networks: {
//     localhost: {
//       url: "http://127.0.0.1:8545",  // URL of the local Ethereum node
//       accounts: {
//         mnemonic: "test test test test test test test test test test test junk",  // Default Hardhat mnemonic
//       },
//     },
//   },
// };



require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-solhint");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
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
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
};