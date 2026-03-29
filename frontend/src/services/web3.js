/**
 * Web3 wallet connection utilities.
 *
 * All functions use window.ethereum.request directly — no ethers Provider is
 * ever created here. This prevents MetaMask from being triggered into its
 * eth_blockNumber polling loop which causes -32002 "too many errors" floods.
 */
import { ethers } from 'ethers';

const HARDHAT_CHAIN_ID = '0x7a69'; // 31337 decimal

/**
 * Ensure MetaMask is on the Hardhat local network (chainId 1337).
 * A chainId mismatch is the most common cause of MetaMask's -32002 backoff.
 */
async function ensureHardhatNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HARDHAT_CHAIN_ID }],
    });
  } catch (err) {
    if (err.code === 4902) {
      // Network not in MetaMask yet — add it
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: HARDHAT_CHAIN_ID,
          chainName: 'Hardhat Local',
          rpcUrls: ['http://127.0.0.1:8545'],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        }],
      });
    }
    // Ignore user dismissal or other non-fatal errors
  }
}

/**
 * Connect to MetaMask and return the wallet address.
 * Switches to Hardhat network first to prevent chainId-mismatch RPC errors.
 */
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install the MetaMask browser extension to vote.');
  }
  await ensureHardhatNetwork();
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const address = accounts[0].toLowerCase();
  return { address };
}

/**
 * Return the currently connected wallet address without triggering a connection popup.
 * Returns null if MetaMask is not connected.
 */
export async function getConnectedAddress() {
  if (!window.ethereum) return null;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    return accounts.length > 0 ? accounts[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Check if the voter's wallet address has already voted in the given contract.
 * Uses eth_call directly — no Provider created, no polling.
 */
export async function checkHasVoted(contractAddress, walletAddress) {
  if (!window.ethereum) return false;
  try {
    const iface = new ethers.Interface(['function hasVoted(address) view returns (bool)']);
    const calldata = iface.encodeFunctionData('hasVoted', [walletAddress]);
    const result = await window.ethereum.request({
      method: 'eth_call',
      params: [{ to: contractAddress, data: calldata }, 'latest'],
    });
    return iface.decodeFunctionResult('hasVoted', result)[0];
  } catch {
    return false;
  }
}
