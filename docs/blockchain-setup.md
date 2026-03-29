# Blockchain Setup — EVoting Platform

This document covers the full blockchain layer of the e-voting platform: the smart contract, Hardhat dev environment, Merkle eligibility system, backend deployment pipeline, and frontend Web3 integration.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Security Model](#2-security-model)
3. [Smart Contract — EVoting.sol](#3-smart-contract--evotingsol)
4. [Hardhat Project Setup](#4-hardhat-project-setup)
5. [Merkle Eligibility System](#5-merkle-eligibility-system)
6. [Backend — Contract Deployment Pipeline](#6-backend--contract-deployment-pipeline)
7. [Backend — Vote Confirmation API](#7-backend--vote-confirmation-api)
8. [Frontend — Web3 Services](#8-frontend--web3-services)
9. [Frontend — Vote Flow (VotePage)](#9-frontend--vote-flow-votepage)
10. [Frontend — Results Page](#10-frontend--results-page)
11. [Environment Variables](#11-environment-variables)
12. [Running Locally (Step-by-Step)](#12-running-locally-step-by-step)
13. [Deploying to Sepolia Testnet](#13-deploying-to-sepolia-testnet)
14. [Testing the Contract](#14-testing-the-contract)
15. [Connecting MetaMask to the Frontend — Full Procedure](#15-connecting-metamask-to-the-frontend--full-procedure)

---

## 1. Architecture Overview

```
Voter (Browser + MetaMask)
        │
        ├─ 1. GET /api/voter/elections/:id/merkle-proof
        │       └─ Backend returns sibling proof from stored Merkle tree
        │
        ├─ 2. contract.castVote(candidateId, merkleProof)
        │       └─ MetaMask signs + broadcasts to Ethereum
        │       └─ Smart contract verifies proof, records vote ON-CHAIN
        │
        └─ 3. POST /api/votes/confirm  { tx_hash, candidate_id, wallet_address }
                └─ Backend stores hash for audit trail ONLY
                └─ Backend CANNOT forge or alter any vote

Admin (Backend Platform Wallet)
        │
        ├─ lock_election_pipeline (RQ job)
        │       ├─ Build Merkle tree from voter wallet addresses
        │       └─ Deploy EVoting contract → contract_address stored in DB
        │
        └─ end_election_job (RQ job)
                └─ Call endElection() on contract → mark completed in DB
```

**Key invariant**: The backend platform wallet deploys and ends contracts, but it never signs a vote transaction. Every vote comes directly from the voter's MetaMask wallet.

---

## 2. Security Model

Three critical corrections were applied based on the Implementation Guide:

### Flaw 1 — Leaf must be computed on-chain (FIXED)
The original design passed a `leaf` parameter from the frontend, allowing any voter to claim another's leaf. The fix: the Solidity contract computes the leaf itself from `msg.sender`:

```solidity
// WRONG — caller controls the leaf
function castVote(uint256 candidateId, bytes32 leaf, bytes32[] calldata proof)

// CORRECT — leaf is derived on-chain, cannot be spoofed
bytes32 hash = keccak256(abi.encodePacked(msg.sender));  // inside _verifyMerkle
```

### Flaw 2 — Double-vote prevention is on-chain (FIXED)
```solidity
// This mapping is the authoritative guard — backend check is UX-only
mapping(address => bool) public hasVoted;
require(!hasVoted[msg.sender], "Already voted");
hasVoted[msg.sender] = true;
```

### Flaw 3 — Backend receives tx hash, never signs votes (FIXED)
```
WRONG:  Backend signs + broadcasts vote → frontend polls for result
CORRECT: Frontend (MetaMask) signs + broadcasts → backend receives tx hash
```

---

## 3. Smart Contract — EVoting.sol

**File**: `contracts/EVoting.sol`
**Solidity**: `^0.8.20`

### Constructor

```solidity
constructor(
    uint256[] memory _candidateIds,   // on-chain integer IDs for each candidate
    uint256 _startTime,               // UNIX timestamp — voting opens
    uint256 _endTime,                 // UNIX timestamp — voting closes
    bytes32 _eligibilityRoot          // Merkle root; bytes32(0) for public elections
)
```

### Key functions

| Function | Who calls it | Gas? | Description |
|---|---|---|---|
| `castVote(candidateId, merkleProof)` | Voter (MetaMask) | Yes | Cast a vote; Merkle proof verified on-chain |
| `endElection()` | Admin wallet | Yes | Freezes all future votes |
| `getResults()` | Anyone | No (view) | Returns `(uint256[] ids, uint256[] counts)` |
| `hasVoted(address)` | Anyone | No (view) | Check if a wallet has already voted |

### Election types

| Type | `eligibilityRoot` | Proof required |
|---|---|---|
| Private | 32-byte Merkle root | Yes — sibling path from voter wallet leaf to root |
| Public | `bytes32(0)` (zero hash) | No — pass `[]`; geographic check was done off-chain |

### Events

```solidity
event VoteCast(address indexed voter, uint256 indexed candidateId, uint256 timestamp);
event ElectionEnded(uint256 endedAt);
```

### Merkle verification (internal)

Uses **sorted-pair keccak256** — identical to OpenZeppelin's MerkleProof library:

```solidity
function _verifyMerkle(address voter, bytes32[] calldata proof) internal view returns (bool) {
    bytes32 hash = keccak256(abi.encodePacked(voter));   // leaf = 20-byte address
    for (uint256 i = 0; i < proof.length; i++) {
        bytes32 p = proof[i];
        hash = hash <= p
            ? keccak256(abi.encodePacked(hash, p))
            : keccak256(abi.encodePacked(p, hash));
    }
    return hash == eligibilityRoot;
}
```

---

## 4. Hardhat Project Setup

### Directory structure

```
blockchain-evoting/          ← Hardhat project root
  contracts/
    EVoting.sol
  scripts/
    deploy.js                ← Manual deployment script
  test/
    Election.test.js         ← Full test suite
  artifacts/                 ← Generated by `npx hardhat compile`
  cache/                     ← Generated by Hardhat
  hardhat.config.js
  package.json
  .env                       ← ALCHEMY_SEPOLIA_URL, PLATFORM_PRIVATE_KEY
```

### Install dependencies

```bash
# From the project root (blockchain-evoting/)
npm install
```

This installs:
- `hardhat ^2.22.0` — Ethereum development framework
- `@nomicfoundation/hardhat-toolbox` — Chai, Waffle, ethers.js bundled
- `ethers ^6.13.0` — ethers.js v6 (used in scripts + tests)
- `@openzeppelin/merkle-tree ^1.0.7` — StandardMerkleTree (used in tests)
- `dotenv ^16.4.5` — loads `.env` into `process.env`

### Compile the contract

```bash
npx hardhat compile
# or
npm run compile
```

Artifacts are written to `artifacts/contracts/EVoting.sol/EVoting.json`. The backend reads this file for ABI + bytecode when `BLOCKCHAIN_ENABLED=true`.

### hardhat.config.js

```js
require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

module.exports = {
  solidity: '0.8.20',
  networks: {
    hardhat: {},           // local in-memory chain, instant blocks
    sepolia: {
      url: process.env.ALCHEMY_SEPOLIA_URL || '',
      accounts: process.env.PLATFORM_PRIVATE_KEY ? [process.env.PLATFORM_PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};
```

---

## 5. Merkle Eligibility System

**File**: `backend/app/jobs/merkle_jobs.py`

### How it works

For **private elections**, eligible voter wallet addresses are collected at election lock time and hashed into a Merkle tree. The root is stored in the smart contract. When a voter casts a ballot, they submit the sibling path (proof), and the contract verifies on-chain that their wallet is in the tree.

### Leaf format

```
leaf = keccak256(abi.encodePacked(wallet_address))
     = keccak256(20-byte address)          ← NOT padded to 32 bytes
```

Python equivalent:
```python
def _wallet_leaf(wallet_address: str) -> str:
    addr_bytes = bytes.fromhex(wallet_address.lower().replace("0x", ""))  # 20 bytes
    return "0x" + Web3.keccak(addr_bytes).hex()
```

This must match the Solidity `keccak256(abi.encodePacked(voter))` exactly. Using `abi.encode` (padded to 32 bytes) would produce a different hash — the proof would always fail.

### Tree construction

Sorted-pair Merkle tree:
1. Sort + deduplicate wallet addresses
2. Compute leaf for each
3. Build layers bottom-up; pad odd layers by duplicating the last leaf
4. At each level: `parent = keccak256(sorted(left, right))`

The full tree is stored as JSON in `elections.merkle_tree_json`:
```json
{
  "addresses": ["0xabc...", "0xdef..."],
  "leaves":    ["0x...", "0x..."],
  "padded_layers": [["0x...", "0x..."], ["0x..."]],
  "root": "0x..."
}
```

`padded_layers` is stored (not just the root) to enable on-demand proof generation without rebuilding the tree.

### Proof generation

```python
def get_proof(tree_data: dict, wallet_address: str) -> list:
    idx = addresses.index(addr)
    for layer in padded_layers[:-1]:          # skip root layer
        sibling_idx = idx ^ 1                 # flip last bit
        proof.append(layer[sibling_idx])
        idx = idx >> 1                        # move to parent
    return proof
```

Returns `None` if the address is not in the tree (voter not eligible).

### Public elections

For public elections the root is `bytes32(0)`. The contract skips the Merkle check entirely:

```solidity
if (eligibilityRoot != bytes32(0)) {
    require(_verifyMerkle(msg.sender, merkleProof), "Not eligible to vote");
}
```

Geographic eligibility for public elections is checked off-chain by the backend during the pre-verification step (`POST /api/voter/elections/:id/verify`).

---

## 6. Backend — Contract Deployment Pipeline

**File**: `backend/app/jobs/merkle_jobs.py` — `lock_election_pipeline(election_id)`

This runs as an RQ background job triggered when an admin locks an election.

### Steps

1. **Collect wallet addresses** (private elections only)
   Joins `election_voters` (by `voter_identifier`) → `users` (by `student_id` / `employee_id`) → reads `wallet_address`

2. **Build Merkle tree**
   `build_merkle_tree(wallet_addresses)` → `(root_hex, tree_data)`
   Public elections use zero root, empty tree.

3. **Deploy contract**
   - `BLOCKCHAIN_ENABLED=false` → deterministic mock address (SHA-256 of `election_id:root:count`)
   - `BLOCKCHAIN_ENABLED=true` → real `web3.py` deployment using ABI + bytecode from `artifacts/`

4. **Persist to DB**
   ```
   election.eligibility_merkle_root  = root
   election.merkle_tree_json         = json.dumps(tree_data)
   election.contract_address         = deployed address
   election.eligibility_locked       = True
   election.candidates_locked        = True
   election.status                   = "active" or "scheduled"
   ```

### Real deployment (web3.py)

```python
def _real_deploy_contract(...) -> str:
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    account = w3.eth.account.from_key(private_key)
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    tx = contract.constructor(candidate_ids, start_time, end_time, merkle_root_bytes32)
              .build_transaction({"from": account.address, "nonce": ..., "gas": 3_000_000})
    signed = account.sign_transaction(tx)
    receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(signed.rawTransaction))
    return receipt.contractAddress
```

### End election job

`end_election_job(election_id)` calls `endElection()` on the deployed contract (when `BLOCKCHAIN_ENABLED=true`) then sets `election.status = "completed"` and `election.results_published = True`.

---

## 7. Backend — Vote Confirmation API

**File**: `backend/app/api/votes.py`

### POST /api/votes/confirm

Called by the frontend **after** MetaMask confirms the transaction on-chain.

```
Headers: Authorization: Bearer <jwt>
Body: {
  "election_id": "<uuid>",
  "tx_hash":     "0x...",
  "candidate_id": 1,
  "wallet_address": "0x..."
}
```

Validations:
- Election must be active
- Voter must have a `verified` pre-verification record
- `tx_hash` must not already exist in `vote_transactions`
- Voter must not have a previous `vote_transactions` record for this election

Stores a `VoteTransaction` row for the audit log. This record is **not** the authoritative vote — the on-chain state is. This is purely for the results page audit trail.

### GET /api/voter/elections/:id/merkle-proof

```
Query param: voter=0x<wallet_address>
```

Returns the sibling proof for a voter's wallet address:
```json
{ "merkle_proof": ["0x...", "0x..."] }
```

Returns `[]` for public elections (no proof needed). Returns 403 if the voter is not in the tree (not eligible).

### GET /api/voter/elections/:id/results

Returns vote counts (from DB `vote_transactions`) plus the transaction audit log:
```json
{
  "election_id": "...",
  "title": "...",
  "contract_address": "0x...",
  "total_votes": 42,
  "candidates": [
    { "candidate_id": 1, "candidate_name": "...", "votes": 24, "position": 1 }
  ],
  "transactions": [
    { "blockchain_tx_hash": "0x...", "timestamp": "2026-03-22T..." }
  ]
}
```

---

## 8. Frontend — Web3 Services

### ElectionABI.js

**File**: `frontend/src/contracts/ElectionABI.js`

Hand-maintained ABI matching `contracts/EVoting.sol`. After running `npx hardhat compile`, the canonical source is `artifacts/contracts/EVoting.sol/EVoting.json`. Keep these in sync when the contract changes.

### web3.js

**File**: `frontend/src/services/web3.js`

```js
connectWallet()           // MetaMask eth_requestAccounts → { provider, signer, address }
getConnectedAddress()     // eth_accounts (no popup) → address or null
getElectionContract()     // Contract + signer (for state-changing castVote)
getReadOnlyContract()     // Contract + JsonRpcProvider (for free view calls)
checkHasVoted()           // hasVoted(address) view call — no MetaMask needed
```

`READ_ONLY_RPC` defaults to `http://127.0.0.1:8545` (local Hardhat). Override with `VITE_RPC_URL` in `frontend/.env` for Sepolia.

### castVote.js

**File**: `frontend/src/services/castVote.js`

6-step voting flow:

```
Step 1  connectWallet()                          → signer, voterAddress
Step 2  GET /api/voter/elections/:id/merkle-proof → merkleProof[]
Step 3  getElectionContract(address, signer)      → contract instance
Step 4  contract.castVote(candidateId, proof)     → MetaMask popup → tx
Step 5  tx.wait()                                 → receipt.hash (on-chain confirmed)
Step 6  POST /api/votes/confirm                   → backend audit trail
```

Returns `txHash` on success.

### getResults.js

**File**: `frontend/src/services/getResults.js`

```js
fetchResultsFromChain(contractAddress)
  // Calls getResults() view — free, no gas, no MetaMask
  // Returns [{ candidateId: number, votes: number }]

hasVotedOnChain(contractAddress, walletAddress)
  // Calls hasVoted(address) view — returns boolean
```

---

## 9. Frontend — Vote Flow (VotePage)

**File**: `frontend/src/pages/VotePage.jsx`

On load:
- Fetches election details (`GET /api/voter/elections/:id`)
- Calls `getConnectedAddress()` (no popup) — shows wallet connected banner if available
- Calls `checkHasVoted(contract_address, walletAddress)` — disables voting if already cast on-chain

On "Confirm & Sign":
- Calls `castVote(electionId, contractAddress, candidatePosition, isPublic, onStatusChange)`
- Status messages shown inline: Connecting wallet → Fetching proof → Waiting for MetaMask → Broadcasting → Recording
- MetaMask rejection (`ACTION_REJECTED`) handled with a user-friendly error
- On success: shows transaction hash + Etherscan link + "View Results" button

---

## 10. Frontend — Results Page

**File**: `frontend/src/pages/ResultsPage.jsx`

On load:
- Fetches `GET /api/voter/elections/:id/results` (DB-backed vote counts + audit log)
- Attempts `fetchResultsFromChain(contract_address)` for live on-chain tallies (silently falls back to DB if node unreachable)

Displays:
- Smart contract badge with Etherscan link + "Live on-chain" indicator when chain data is available
- Bar chart of vote tallies (winner highlighted)
- Transparency proofs section: contract address, Merkle root explanation
- Per-transaction audit log with individual Etherscan links

---

## 11. Environment Variables

### Root `.env` (Hardhat)

```env
ALCHEMY_SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
PLATFORM_PRIVATE_KEY=0x<hex>   # platform deployer wallet private key
```

### `backend/.env`

```env
BLOCKCHAIN_ENABLED=false        # set true to use real Hardhat/Sepolia node
RPC_URL=http://127.0.0.1:8545   # Hardhat local node (or Alchemy Sepolia URL)
PLATFORM_PRIVATE_KEY=           # deployer wallet key (leave blank for mock mode)
ALCHEMY_SEPOLIA_URL=            # Sepolia RPC for production
```

### `frontend/.env`

```env
VITE_RPC_URL=http://127.0.0.1:8545   # local Hardhat; change to Alchemy for Sepolia
VITE_API_BASE_URL=http://localhost:5001
```

---

## 12. Running Locally (Step-by-Step)

### 1. Compile the contract

```bash
cd /path/to/blockchain-evoting
npm install
npm run compile
# artifacts/ directory is created with EVoting.json
```

### 2. Start a local Ethereum node

```bash
npm run node
# Hardhat node starts on http://127.0.0.1:8545
# Prints 20 pre-funded test accounts with private keys
```

Keep this terminal running.

### 3. Enable blockchain in backend

```bash
# backend/.env
BLOCKCHAIN_ENABLED=true
RPC_URL=http://127.0.0.1:8545
PLATFORM_PRIVATE_KEY=0x<one of the Hardhat test account private keys>
```

### 4. Start the backend

```bash
cd backend
python run.py
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 6. Configure MetaMask for local Hardhat

1. Open MetaMask → Add Network
2. Network Name: `Hardhat Local`
3. RPC URL: `http://127.0.0.1:8545`
4. Chain ID: `31337`
5. Currency: `ETH`
6. Import a Hardhat test account (copy a private key from `npm run node` output)

### 7. Voter wallet linking

Before an admin locks an election, voters must link their MetaMask wallet:
- Navigate to any election detail page
- Click **Link MetaMask Wallet** in the wallet section
- MetaMask prompts for connection
- Wallet address is saved via `PUT /api/auth/wallet`

This is required for private elections — the wallet address is included in the Merkle tree when the admin locks eligibility.

### 8. Lock an election (admin)

Trigger via admin UI or directly enqueue the RQ job:

```python
from rq import Queue
from redis import Redis
from app.jobs.merkle_jobs import lock_election_pipeline

q = Queue(connection=Redis())
q.enqueue(lock_election_pipeline, "<election_uuid>")
```

This:
- Builds the Merkle tree from authorized voter wallet addresses
- Deploys the EVoting contract to the local Hardhat node
- Saves `contract_address` and `merkle_tree_json` in the DB

### 9. Cast a vote

- Open the election page → verify eligibility → click **Cast Vote →**
- MetaMask opens with the transaction details
- Confirm → wait 1–2 seconds (Hardhat mines instantly)
- Success screen shows the transaction hash

---

## 13. Deploying to Sepolia Testnet

### Get Sepolia ETH

The platform deployer wallet needs Sepolia ETH for gas. Use a faucet:
- `https://sepoliafaucet.com` (requires Alchemy account)
- `https://faucet.quicknode.com/ethereum/sepolia`

### Configure

```env
# Root .env
ALCHEMY_SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
PLATFORM_PRIVATE_KEY=0x<deployer-private-key>

# backend/.env
BLOCKCHAIN_ENABLED=true
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
PLATFORM_PRIVATE_KEY=0x<deployer-private-key>

# frontend/.env
VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
```

### Manual deploy (for testing)

```bash
npm run deploy:sepolia
# Prints contract address → verify on https://sepolia.etherscan.io
```

### MetaMask for Sepolia

Switch MetaMask network to **Sepolia Test Network** (built-in). Voters need Sepolia ETH in their wallets to pay gas for `castVote` transactions (~0.001–0.005 ETH per vote at typical gas prices).

---

## 14. Testing the Contract

**File**: `test/Election.test.js`

```bash
npm test
# or
npx hardhat test
```

### Test coverage

| Suite | Cases |
|---|---|
| Deployment | Admin set correctly, eligibility root stored, candidate IDs stored |
| castVote | Eligible voter can vote, double-vote rejected, wrong proof rejected, invalid candidate rejected, vote after `endElection` rejected |
| Public election | Any voter with `[]` proof succeeds, double-vote still prevented |
| getResults | Returns correct counts after multiple votes |
| endElection | Only admin can call, emits `ElectionEnded` event |

Tests use `@openzeppelin/merkle-tree`'s `StandardMerkleTree` to generate valid proofs, ensuring the Python tree implementation and the JavaScript test tree produce compatible proofs against the same Solidity verification logic.

---

## 15. Connecting MetaMask to the Frontend — Full Procedure

This section documents the exact steps and fixes required to connect MetaMask to the local Hardhat node and successfully cast votes from the frontend.

---

### 15.1 Why Standard Setup Fails

When connecting MetaMask to a local Hardhat node, three issues occur by default:

| Problem | Root Cause | Fix Applied |
|---|---|---|
| `TransactionExecutionError: StackOverflow` on deployment | Solidity 0.8.20 compiles for the `shanghai` EVM (`PUSH0` opcode) which Hardhat 2 doesn't support | Added `evmVersion: "paris"` to hardhat.config.js |
| MetaMask `-32002` "RPC endpoint returned too many errors" | ethers.js v6 `BrowserProvider` / `JsonRpcProvider` auto-polls `eth_blockNumber` on every Provider construction, flooding the local node | Removed all ethers Provider creation; replaced with direct `window.ethereum.request` calls |
| MetaMask confirm button disabled / transaction fails silently | Wallet has 0 ETH on the local network (own MetaMask account, not a Hardhat test account) | Import a Hardhat pre-funded test account |

---

### 15.2 Hardhat Configuration (hardhat.config.js)

The root `hardhat.config.js` must have:

```js
solidity: {
  version: '0.8.20',
  settings: {
    evmVersion: 'paris',   // REQUIRED — prevents StackOverflow on Hardhat 2
  },
},
networks: {
  hardhat: {
    chainId: 31337,        // Must match MetaMask network config
  },
},
```

**Why `paris`?**
Solidity 0.8.20+ defaults to the `shanghai` EVM which includes the `PUSH0` opcode (EIP-3855). Hardhat 2's EVM does not support this opcode. Deploying `shanghai`-compiled bytecode on Hardhat 2 causes `TransactionExecutionError: StackOverflow` silently — the contract cannot be deployed at all. Setting `evmVersion: "paris"` compiles without `PUSH0` and resolves this.

**Why `chainId: 31337`?**
Hardhat's default chainId is `31337`. MetaMask's built-in "Localhost 8545" preset also uses `31337`. Using any other chainId (e.g. `1337`) causes a mismatch: MetaMask's background health-check polls (`eth_blockNumber`, `eth_chainId`) return inconsistent results, which triggers MetaMask's internal backoff and floods all subsequent requests with `-32002` errors.

After any change to `hardhat.config.js`, recompile:
```bash
npx hardhat compile
```

---

### 15.3 MetaMask Network Setup (One-Time)

1. Open MetaMask → click the network dropdown at the top
2. Click **Add a custom network**
3. Fill in:
   - **Network Name**: `Hardhat Local`
   - **New RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`
4. Click **Save** and switch to `Hardhat Local`

> If you previously added Localhost 8545 with Chain ID `1337`, delete it and add a new entry with `31337`.

---

### 15.4 Import a Pre-Funded Test Account

Your personal MetaMask wallet has 0 ETH on the local Hardhat network. MetaMask will disable the "Confirm" button on any transaction if there is no ETH for gas.

When `npx hardhat node` starts, it prints 20 pre-funded accounts, each with **10,000 ETH**. Import one:

1. Copy a private key from the Hardhat node output, e.g.:
   ```
   Account #0: 0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266
   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
2. In MetaMask → click the account icon (top right) → **Import Account**
3. Paste the private key → **Import**
4. Switch to that account — it will show 10,000 ETH on the Hardhat Local network

> **Warning**: Never use these private keys on any real network. They are publicly known.

---

### 15.5 Reset MetaMask Account (When Errors Persist)

When the Hardhat node restarts, all on-chain state is wiped. MetaMask caches the nonce and transaction history of your account, which becomes stale and causes errors.

After restarting `npx hardhat node`, always reset the MetaMask account:

1. MetaMask → click the account icon → **Settings**
2. **Advanced** → **Reset Account**
3. Confirm

This clears MetaMask's cached nonce and transaction list for the current network. It does **not** delete your account or private key.

---

### 15.6 Auto Network Switch (Frontend Code)

`frontend/src/services/web3.js` includes `ensureHardhatNetwork()` which automatically switches MetaMask to the correct network (chainId `31337`) every time `connectWallet()` is called:

```js
async function ensureHardhatNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x7a69' }],  // 31337
    });
  } catch (err) {
    if (err.code === 4902) {
      // Network not in MetaMask yet — add it automatically
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x7a69',
          chainName: 'Hardhat Local',
          rpcUrls: ['http://127.0.0.1:8545'],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        }],
      });
    }
  }
}
```

MetaMask will show a **one-time popup** asking the user to approve the network switch. After approval, all subsequent `connectWallet()` calls switch silently.

---

### 15.7 Avoiding the -32002 RPC Flood

The `-32002 "RPC endpoint returned too many errors"` error is caused by ethers.js v6 automatically polling `eth_blockNumber` whenever a `BrowserProvider` or `JsonRpcProvider` is constructed. On a local Hardhat node this overwhelms the JSON-RPC server.

**All ethers Provider construction has been removed from the frontend.** The following replacements are in place:

| Old (caused -32002) | New (no polling) |
|---|---|
| `new ethers.BrowserProvider(window.ethereum)` | `window.ethereum.request({ method: 'eth_requestAccounts' })` |
| `new ethers.JsonRpcProvider('http://127.0.0.1:8545')` | Removed entirely |
| `contract.castVote(...)` via ethers Contract | `window.ethereum.request({ method: 'eth_sendTransaction', params: [...] })` |
| `tx.wait()` for confirmation | Removed — `txHash` returned immediately from `eth_sendTransaction` |
| `contract.hasVoted(address)` | `window.ethereum.request({ method: 'eth_call', ... })` |
| `contract.getResults()` | `window.ethereum.request({ method: 'eth_call', ... })` |

The only ethers import remaining is `ethers.Interface` — used purely for ABI encoding/decoding, which is a local CPU operation and makes zero network calls.

---

### 15.8 Full Checklist Before Casting a Vote

- [ ] `npx hardhat compile` run after any contract or config change
- [ ] `npx hardhat node` running in a terminal (keep it open)
- [ ] MetaMask network set to `Hardhat Local` (Chain ID `31337`, RPC `http://127.0.0.1:8545`)
- [ ] MetaMask account is a Hardhat test account (has ETH)
- [ ] MetaMask account was **Reset** after the last Hardhat node restart
- [ ] Election has been locked by admin (contract deployed, `contract_address` saved in DB)
- [ ] Voter has completed pre-verification for the election
- [ ] Backend (`python run.py`) and RQ worker running
- [ ] `BLOCKCHAIN_ENABLED=true` in `backend/.env` (for real on-chain deployment)

---

## File Reference

| File | Purpose |
|---|---|
| `contracts/EVoting.sol` | Solidity smart contract |
| `hardhat.config.js` | Hardhat networks + compiler config |
| `package.json` | Root-level Node.js project (Hardhat) |
| `scripts/deploy.js` | Manual deployment script |
| `test/Election.test.js` | Contract test suite |
| `backend/app/jobs/merkle_jobs.py` | Merkle tree + contract deployment RQ jobs |
| `backend/app/api/votes.py` | Vote confirmation + results + proof API |
| `backend/migrations/versions/b3c4d5e6f7a8_*.py` | DB migration adding `merkle_tree_json` column |
| `frontend/src/contracts/ElectionABI.js` | Contract ABI for ethers.js |
| `frontend/src/services/web3.js` | MetaMask connection utilities |
| `frontend/src/services/castVote.js` | 6-step vote casting flow |
| `frontend/src/services/getResults.js` | Read-only on-chain results fetch |
| `frontend/src/pages/VotePage.jsx` | Voter ballot UI with MetaMask integration |
| `frontend/src/pages/ResultsPage.jsx` | Election results with on-chain verification |
| `frontend/src/pages/ElectionDetailPage.jsx` | Election details + wallet linking + pre-verification |
