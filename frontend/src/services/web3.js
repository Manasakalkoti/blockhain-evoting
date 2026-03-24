/**
 * Web3 wallet connection utilities.
 *
 * connectWallet()         — request MetaMask account access, return { provider, signer, address }
 * getElectionContract()   — return a Contract instance connected to a signer (for voting)
 * getReadOnlyContract()   — return a Contract instance with read-only provider (for results)
 * getWalletAddress()      — return connected wallet address without full connection prompt
 */
import { ethers } from 'ethers';
import { EVOTING_ABI } from '../contracts/ElectionABI';

// RPC URL for read-only calls (no wallet needed).
// In local dev this points to Hardhat. In production, use Alchemy Sepolia.
const READ_ONLY_RPC = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';

/**
 * Connect to MetaMask and return provider + signer.
 * Throws if MetaMask is not installed.
 */
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install the MetaMask browser extension to vote.');
  }

  await window.ethereum.request({ method: 'eth_requestAccounts' });
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

/**
 * Return the currently connected wallet address without triggering a full connection.
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
 * Return a Contract instance connected to the voter's MetaMask signer.
 * Used for state-changing calls (castVote) — MetaMask will prompt for signature.
 */
export function getElectionContract(contractAddress, signer) {
  return new ethers.Contract(contractAddress, EVOTING_ABI, signer);
}

/**
 * Return a read-only Contract instance (no MetaMask needed).
 * Used for view calls like getResults() and hasVoted().
 */
export function getReadOnlyContract(contractAddress) {
  const provider = new ethers.JsonRpcProvider(READ_ONLY_RPC);
  return new ethers.Contract(contractAddress, EVOTING_ABI, provider);
}

/**
 * Check if the voter's wallet address has already voted in the given contract.
 * Free view call — no gas, no MetaMask popup.
 */
export async function checkHasVoted(contractAddress, walletAddress) {
  try {
    const contract = getReadOnlyContract(contractAddress);
    return await contract.hasVoted(walletAddress);
  } catch {
    return false; // contract not reachable — backend is source of truth
  }
}
