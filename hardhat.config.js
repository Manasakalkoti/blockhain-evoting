require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.20',
  networks: {
    // Local dev — instant blocks, 10,000 pre-funded test accounts
    hardhat: {},
    // Sepolia testnet — for final demo
    sepolia: {
      url: process.env.ALCHEMY_SEPOLIA_URL || '',
      accounts: process.env.PLATFORM_PRIVATE_KEY
        ? [process.env.PLATFORM_PRIVATE_KEY]
        : [],
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};
