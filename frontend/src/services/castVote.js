/**
 * castVote — complete voting flow using window.ethereum.request directly.
 *
 * No ethers Provider is created anywhere in this flow — that eliminates the
 * eth_blockNumber polling that causes MetaMask's -32002 "too many errors" flood.
 *
 * The backend NEVER signs the transaction — only the voter's MetaMask wallet does.
 */
import { ethers } from 'ethers';
import api from '../api/client';
import { connectWallet } from './web3';

const CAST_VOTE_IFACE = new ethers.Interface([
  'function castVote(uint256 candidateId, bytes32[] calldata merkleProof)',
]);

// Pre-set gas limit so MetaMask skips eth_estimateGas (another RPC call that
// can fail with -32002 when the node is under polling pressure).
const VOTE_GAS_LIMIT = '0x55730'; // 350 000 gas — enough for any vote

/**
 * Retry eth_sendTransaction when MetaMask returns -32002.
 * MetaMask's backoff timer is ~30s — we wait 32s with a visible countdown
 * so the user sees progress instead of a frozen button.
 */
async function sendTransaction(params, onStatusChange, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await window.ethereum.request({ method: 'eth_sendTransaction', params });
    } catch (err) {
      const isRpcBackoff = err.code === -32002 || err.message?.includes('too many errors');
      if (isRpcBackoff && attempt < maxRetries - 1) {
        for (let s = 32; s > 0; s--) {
          onStatusChange(`MetaMask node sync — retrying in ${s}s…`);
          await new Promise((r) => setTimeout(r, 1000));
        }
        onStatusChange('Retrying…');
        continue;
      }
      throw err;
    }
  }
}

/**
 * @param {string} electionId        - UUID of the election
 * @param {string} contractAddress   - Deployed EVoting contract address
 * @param {number} candidatePosition - On-chain candidate ID (position integer)
 * @param {boolean} isPublic         - If true, election uses zero Merkle root (no proof)
 * @param {function} onStatusChange  - Optional callback(statusMessage) for UI updates
 * @returns {string} txHash — the on-chain transaction hash
 */
export async function castVote(
  electionId,
  contractAddress,
  candidatePosition,
  isPublic = false,
  onStatusChange = () => {}
) {
  // ── Step 1: Connect MetaMask wallet (no BrowserProvider created) ────────────
  onStatusChange('Connecting wallet…');
  const { address: voterAddress } = await connectWallet();

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

  // ── Step 3: Encode calldata via ethers ABI (no Provider, just encoding) ─────
  const calldata = CAST_VOTE_IFACE.encodeFunctionData('castVote', [
    candidatePosition,
    merkleProof,
  ]);

  // ── Step 4: Send transaction via MetaMask — gas pre-set to skip estimateGas ─
  onStatusChange('Waiting for MetaMask signature…');
  const txHash = await sendTransaction([{
    from: voterAddress,
    to: contractAddress,
    data: calldata,
    gas: VOTE_GAS_LIMIT,
  }], onStatusChange);

  // ── Step 5: Send tx hash to backend for audit trail (fire-and-forget) ──────
  // The vote is already on-chain at this point. A DB write failure must not
  // prevent the voter from seeing their tx hash and success screen.
  onStatusChange('Recording vote…');
  api.post('/api/votes/confirm', {
    election_id: electionId,
    tx_hash: txHash,
    candidate_id: candidatePosition,
    wallet_address: voterAddress.toLowerCase(),
  }).catch((err) => {
    console.warn('Vote confirm API failed (vote is still on-chain):', err?.response?.data?.message || err.message);
  });

  return txHash;
}
