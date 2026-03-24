/**
 * castVote — complete 6-step voting flow per the Implementation Guide.
 *
 * Step 1: Connect wallet (MetaMask)
 * Step 2: Fetch Merkle proof from backend API
 * Step 3: Get contract instance connected to voter's signer
 * Step 4: Call castVote() — MetaMask pops up for voter to sign
 * Step 5: Wait for on-chain confirmation, get tx hash
 * Step 6: Send tx hash to backend for audit trail
 *
 * The backend NEVER signs the transaction — only the voter's MetaMask wallet does.
 * This is the critical security property: the blockchain protects the act of voting.
 */
import api from '../api/client';
import { connectWallet, getElectionContract } from './web3';

/**
 * @param {string} electionId       - UUID of the election
 * @param {string} contractAddress  - Deployed EVoting contract address
 * @param {number} candidatePosition - On-chain candidate ID (position integer)
 * @param {boolean} isPublic        - If true, election uses zero Merkle root (no proof)
 * @param {function} onStatusChange - Optional callback(statusMessage) for UI updates
 * @returns {string} txHash — the on-chain transaction hash
 */
export async function castVote(
  electionId,
  contractAddress,
  candidatePosition,
  isPublic = false,
  onStatusChange = () => {}
) {
  // ── Step 1: Connect MetaMask wallet ────────────────────────────────────────
  onStatusChange('Connecting wallet…');
  const { signer, address: voterAddress } = await connectWallet();

  // ── Step 2: Fetch Merkle proof from backend ────────────────────────────────
  onStatusChange('Fetching eligibility proof…');
  let merkleProof = [];
  if (!isPublic) {
    const { data } = await api.get(
      `/api/voter/elections/${electionId}/merkle-proof`,
      { params: { voter: voterAddress } }
    );
    merkleProof = data.merkle_proof || [];
  }

  // ── Step 3: Get contract instance connected to voter's wallet ──────────────
  const contract = getElectionContract(contractAddress, signer);

  // ── Step 4: Submit vote — MetaMask will prompt voter to sign ───────────────
  onStatusChange('Waiting for MetaMask signature…');
  const tx = await contract.castVote(candidatePosition, merkleProof);

  // ── Step 5: Wait for on-chain confirmation ─────────────────────────────────
  onStatusChange('Broadcasting to blockchain… (this may take 15–30s)');
  const receipt = await tx.wait();
  const txHash = receipt.hash;

  // ── Step 6: Send tx hash to backend for audit trail ───────────────────────
  onStatusChange('Recording vote…');
  await api.post('/api/votes/confirm', {
    election_id: electionId,
    tx_hash: txHash,
    candidate_id: candidatePosition,
    wallet_address: voterAddress.toLowerCase(),
  });

  return txHash;
}
