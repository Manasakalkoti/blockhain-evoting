/**
 * getResults — fetch election results from the blockchain (read-only, free, no gas).
 *
 * Uses eth_call directly via window.ethereum — no Provider created, no polling,
 * no eth_blockNumber calls that flood the console with "-32002" errors.
 */
import { ethers } from 'ethers';

const IFACE = new ethers.Interface([
  'function getResults() view returns (uint256[] ids, uint256[] counts)',
  'function hasVoted(address) view returns (bool)',
]);

async function ethCall(contractAddress, fragment, args = []) {
  const provider = window.ethereum
    ? window.ethereum
    : { request: () => { throw new Error('No provider'); } };
  const calldata = IFACE.encodeFunctionData(fragment, args);
  const result = await provider.request({
    method: 'eth_call',
    params: [{ to: contractAddress, data: calldata }, 'latest'],
  });
  return IFACE.decodeFunctionResult(fragment, result);
}

/**
 * @param {string} contractAddress - Deployed EVoting contract address
 * @returns {{ candidateId: number, votes: number }[]}
 */
export async function fetchResultsFromChain(contractAddress) {
  const [candidateIds, voteCounts] = await ethCall(contractAddress, 'getResults');
  return candidateIds.map((id, i) => ({
    candidateId: Number(id),
    votes: Number(voteCounts[i]),
  }));
}

/**
 * Check on-chain if a specific wallet has already voted.
 */
export async function hasVotedOnChain(contractAddress, walletAddress) {
  try {
    const [result] = await ethCall(contractAddress, 'hasVoted', [walletAddress]);
    return result;
  } catch {
    return false;
  }
}
