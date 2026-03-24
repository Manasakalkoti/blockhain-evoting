/**
 * getResults — fetch election results from the blockchain (read-only, free, no gas).
 *
 * Calls getResults() view function on the deployed EVoting contract.
 * No MetaMask popup — uses a read-only JSON-RPC provider.
 *
 * Returns an array of { candidateId, votes } objects.
 */
import { getReadOnlyContract } from './web3';

/**
 * @param {string} contractAddress - Deployed EVoting contract address
 * @returns {{ candidateId: number, votes: number }[]}
 */
export async function fetchResultsFromChain(contractAddress) {
  const contract = getReadOnlyContract(contractAddress);
  const [candidateIds, voteCounts] = await contract.getResults();
  return candidateIds.map((id, i) => ({
    candidateId: Number(id),
    votes: Number(voteCounts[i]),
  }));
}

/**
 * Check on-chain if a specific wallet has already voted.
 * @param {string} contractAddress
 * @param {string} walletAddress
 * @returns {boolean}
 */
export async function hasVotedOnChain(contractAddress, walletAddress) {
  try {
    const contract = getReadOnlyContract(contractAddress);
    return await contract.hasVoted(walletAddress);
  } catch {
    return false;
  }
}
