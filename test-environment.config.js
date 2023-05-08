module.exports = {
  // contracts: {
  //   type: 'truffle', // Contract abstraction to use: 'truffle' for @truffle/contract or 'web3' for web3-eth-contract
  //   defaultGas: 6e6, // Maximum gas for contract calls (when unspecified)
  //
  //   // Options available since v0.1.2
  //   defaultGasPrice: 20e9, // Gas price for contract calls (when unspecified)
  //   artifactsDir: 'build/contracts', // Directory where contract artifacts are stored
  // },
  accounts: {
    amount: 10, // Number of unlocked accounts
    ether: 100, // Initial balance of unlocked accounts (in ether)
  },

  node: { // Options passed directly to Ganache client
    fork: 'https://mainnet.infura.io/v3/d1b9cc4b56ba4aeeabc7702e41430865@17214975',
    unlocked_accounts: ['0xe65c4E7739879C61E6B07f8d92fC5dc744793A82', '0xBA9b7aEB59522C6f9d83449d1615EF848DB6Ba7c', '0xF20f881915B3923c2E6D7d0e5666fe3F99b5F246', '0xfb5C28a1e4d6DFC372Dc0Aeef7AF8AdE27668F42'],
    gasLimit: 8e10, // Maximum gas per block
    gasPrice: 20e9 // Sets the default gas price for transactions if not otherwise specified.
  },
};
