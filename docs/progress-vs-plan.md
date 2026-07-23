# Project Progress vs Execution Plan

This document compares what has actually been built against what was planned in `EXECUTION_PLAN.md`.
It is written for a student who wants to understand the current state of the project.

---

## Quick Summary Table

| Task | Name | Status | Done As Planned? |
|------|------|--------|-----------------|
| TASK-001 | Project Setup & Dev Environment | ✅ Done | Mostly — Firebase replaced with email/password auth |
| TASK-002 | Database Schema & Migrations | ✅ Done | Yes, with minor additions |
| TASK-003 | Solidity Smart Contract (EVoting.sol) | ✅ Done | Mostly — interface slightly different, no tests written |
| TASK-004 | Auth Backend (Firebase OTP + JWT) | ✅ Done | **Differently** — Firebase OTP dropped, email/password used |
| TASK-005 | Voter Registration & Wallet Linking | ✅ Done | **Differently** — merged into auth routes, no nonce signature |
| TASK-006 | Election CRUD & Lifecycle APIs | ✅ Done | Yes, plus extra endpoints added |
| TASK-007 | React App Scaffold & Auth UI | ✅ Done | Mostly — no Firebase OTP UI, no Web3Context |
| TASK-008 | Merkle Tree Generation | ✅ Done | **Differently** — code exists but zero root used for all elections |
| TASK-009 | Smart Contract Deployment Pipeline | ✅ Done | **Differently** — runs synchronously, not via RQ worker |
| TASK-010 | Voter Pre-Verification Flow | ✅ Done | **Differently** — no RQ job, no shapely, simple text match |
| TASK-011 | Admin Dashboard UI | ✅ Done | Yes |
| TASK-012 | Vote Casting Flow | ✅ Done | Mostly — no on-chain TX verification on backend |
| TASK-013 | Results & Audit View | ✅ Done | Yes, with dual source (on-chain + DB fallback) |
| TASK-014 | Background Worker Infrastructure | ⚠️ Partial | RQ initialized but workers not running; all jobs run synchronously |
| TASK-015 | Redis Caching Layer | ❌ Not Done | Redis connected but no caching implemented |
| TASK-016 | Geocoding & Constituency Verification | ⚠️ Partial | GEO_MOCK only — no real geocoding, no shapely |
| TASK-017 | Integration Tests | ❌ Not Done | No pytest, no Hardhat tests, no Cypress |
| TASK-018 | Security Hardening | ⚠️ Partial | Rate limiter wired, JWT works — but several gaps remain |
| TASK-019 | Deployment Config & Documentation | ❌ Not Done | No docker-compose, no README, no seed-demo |
| TASK-020 | Demo Prep & Final Polish | ⚠️ Partial | Core flow works, some rough edges remain |

---

## Detailed Task-by-Task Breakdown

---

### TASK-001 — Project Setup ✅

**What the plan said:** Create monorepo with `/backend`, `/frontend`, `/contracts`, `/workers` directories, install all dependencies, configure `.env`.

**What was actually built:** All four directories exist. All planned backend libraries are installed (Flask, SQLAlchemy, web3.py, redis, rq, etc.) and all planned frontend libraries are installed (React/Vite, ethers.js, Axios, TailwindCSS, React Router).

**Key difference:** The plan specified Firebase OTP for voter authentication. Partway through, this was replaced with a simpler email + password flow. Firebase is still installed (`firebase.js` exists) but is not used anywhere meaningful. There is no `/workers` folder — background job code lives in `backend/app/jobs/` instead.

---

### TASK-002 — Database Schema & Migrations ✅

**What the plan said:** Create 7 tables — `organizations`, `users`, `elections`, `constituencies`, `candidates`, `election_voters`, `voter_verifications`, `vote_transactions`.

**What was actually built:** All 7 tables are implemented exactly as planned. Every column mentioned in the plan exists in the models.

**Minor additions not in plan:**
- `elections.merkle_tree_json` (TEXT) — stores the full Merkle tree so proofs can be generated on-demand without Redis
- `elections.location_rules` (TEXT as JSON) — stores district/ward/pincode rules for public elections
- `users.firebase_uid` — present in model as planned (note in plan said it would be added during TASK-004)

**Key file:** `backend/migrations/versions/5cab6c1da0bc_initial_schema_all_tables.py` — one migration that creates everything at once.

---

### TASK-003 — Solidity Smart Contract ✅

**What the plan said:**
```
constructor(uint startTime, uint endTime, string[] candidates, bytes32 merkleRoot, address admin)
vote(uint candidateId, bytes32[] merkleProof)
getResults() returns (uint[])
endElection()
getElectionState() returns (uint8)
```

**What was actually built (`contracts/EVoting.sol`):**

The contract is implemented and works. However, the interface is slightly different from the plan:

| Planned | Actual |
|---------|--------|
| `constructor(startTime, endTime, string[] candidates, bytes32 merkleRoot, address admin)` | `constructor(uint256[] _candidateIds, uint256 _startTime, uint256 _endTime, bytes32 _eligibilityRoot)` |
| Takes `address admin` as parameter | `admin = msg.sender` — deployer is automatically the admin |
| Takes `string[] candidates` (names) | Takes `uint256[] _candidateIds` (position integers) |
| `vote(uint candidateId, bytes32[] merkleProof)` | `castVote(uint256 candidateId, bytes32[] calldata merkleProof)` |
| `getResults() returns (uint[])` — one array | `getResults() returns (uint256[] ids, uint256[] counts)` — two arrays |
| `getElectionState() returns (uint8)` | **Not implemented** — state derived from `ended` flag + timestamps |

**What is missing:**
- `nonReentrant` modifier (planned in TASK-018) — not added yet
- No Hardhat test file (`EVoting.test.js`) has been written

**Security improvement over plan:** The leaf hash in `_verifyMerkle()` is computed on-chain from `msg.sender` (not submitted by the caller). This means a voter cannot claim another voter's Merkle leaf — the plan did not explicitly specify this, but the implementation is more secure.

---

### TASK-004 — Auth Backend ⚠️ Done Differently

**What the plan said:** Firebase OTP flow — voter sends phone number, Firebase sends SMS, voter submits OTP, backend verifies Firebase ID token, issues JWT.

**What was actually built:** Full email + password authentication. Firebase OTP was dropped entirely.

**Endpoints planned vs actual:**

| Planned | Actual | Status |
|---------|--------|--------|
| `POST /api/auth/send-otp` | — | ❌ Not built |
| `POST /api/auth/verify-otp` | `POST /api/auth/login` | ✅ (different mechanism) |
| `POST /api/auth/admin/login` | `POST /api/auth/admin/login` | ✅ Same |
| `GET /api/auth/me` | `GET /api/auth/profile` | ✅ (renamed) |
| — | `POST /api/auth/register` | ✅ (new) |
| — | `PUT /api/auth/profile` | ✅ (new) |
| — | `PUT /api/auth/wallet` | ✅ (wallet linking moved here from TASK-005) |

**Why the change:** Firebase OTP requires configuring a Firebase project, adding test phone numbers, and dealing with SMS quota during development. Email + password is simpler and faster to build.

**JWT difference:** Plan said 1-hour expiry. Actual is 24-hour expiry. No Redis blocklist for logout (planned in TASK-018).

The `@require_jwt` and `@require_admin` decorators in `backend/app/api/middleware.py` match the plan's intent exactly.

---

### TASK-005 — Voter Registration & Wallet Linking ⚠️ Done Differently

**What the plan said:**
- `POST /api/voters/register` — validate + hash Aadhaar, create user
- `POST /api/voters/link-wallet` — voter signs nonce with MetaMask, backend recovers address
- `GET /api/voters/profile` — return profile

**What was actually built:**
- Registration is part of `POST /api/auth/register` — no Aadhaar field collected
- Wallet linking is `PUT /api/auth/wallet` — simply stores the address, **no nonce/signature challenge**
- Profile is `GET /api/auth/profile`

**Critical difference — wallet linking security:**
The plan said: voter signs a nonce with MetaMask → backend uses `web3.eth.account.recover_message()` to verify they own that wallet.
The actual code: voter just sends the address as a string → backend stores it directly.

This means a voter could technically claim they own a wallet address they don't. For a college demo this is acceptable, but it would need fixing for a real deployment.

---

### TASK-006 — Election CRUD & Lifecycle APIs ✅

**What the plan said:** CRUD for elections, candidate management, CSV upload, lock, end.

**What was actually built:** All planned endpoints exist. Several extra endpoints were added that were not in the plan:

| Endpoint | In Plan? | Notes |
|----------|----------|-------|
| `POST /api/elections` | ✅ Yes | Auto-creates a default constituency |
| `GET /api/elections` | ✅ Yes | Admin only |
| `GET /api/elections/:id` | ✅ Yes | |
| `PUT /api/elections/:id` | ✅ Yes | |
| `DELETE /api/elections/:id` | ❌ Extra | Not in plan, added for convenience |
| `POST /api/elections/:id/lock` | ✅ Yes | Runs synchronously, not via RQ |
| `POST /api/elections/:id/end` | ✅ Yes | Runs synchronously |
| `POST /api/elections/:id/voters/upload` | ✅ Yes | In `voters.py` |
| `DELETE /api/elections/:id/voters` | ❌ Extra | Clear voters so CSV can be re-uploaded |
| `PUT /api/elections/:id/geo-eligibility` | ❌ Extra | Save location rules for public elections |
| `POST /api/elections/:id/geo-eligibility/lock` | ❌ Extra | Lock and hash the rules |
| `GET /api/elections/:id/constituencies` | ❌ Extra | |
| `POST /api/elections/:id/constituencies` | ❌ Extra | |
| `POST /api/elections/:id/redeploy` | ❌ Extra | Dev helper for Hardhat restarts |
| `GET /api/elections/:id/job-status` | ❌ Extra | Poll job status |
| `GET /api/elections/:id/voters` | ❌ Extra | List uploaded voter IDs |
| `GET /api/elections/:id/audit` | ❌ Extra | Compare on-chain vs DB vote counts |

**Important difference:** The plan said `POST /api/elections/:id/lock` should enqueue an RQ background job. The actual code runs the lock pipeline synchronously in the request because the RQ worker crashes on macOS (SIGABRT caused by web3.py + fork() interaction).

---

### TASK-007 — React App Scaffold & Auth UI ✅

**What the plan said:** React + Vite, AuthContext, Firebase OTP UI, Admin login page, ProtectedRoute, Web3Context with ethers.js.

**What was actually built:**
- React + Vite ✅
- `AuthContext` ✅ — stores JWT in localStorage, handles login/logout
- `ProtectedRoute` ✅
- Admin login page ✅
- Voter login + register pages ✅

**What is different:**
- No Firebase OTP multi-step UI — replaced with simple email/password form
- No `Web3Context` — MetaMask interaction is handled directly inside `services/web3.js` and `services/castVote.js` using `window.ethereum.request()` calls. This avoids creating an ethers.js `BrowserProvider`, which caused MetaMask to enter an error-flooding polling loop on a local Hardhat node.

---

### TASK-008 — Merkle Tree Generation ⚠️ Done Differently

**What the plan said:** RQ job reads voter wallet addresses, builds Merkle tree with `keccak256(abi.encodePacked(address))` leaf encoding, stores root in DB, caches proofs in Redis per wallet.

**What was actually built:**
The Merkle tree code in `backend/app/jobs/merkle_jobs.py` is fully implemented and mathematically correct — `build_merkle_tree()`, `get_proof()`, `_wallet_leaf()`. The leaf encoding matches the Solidity contract exactly.

**However, a key design decision was made:** The system always deploys contracts with a **zero Merkle root** (`0x000...000`). This means on-chain proof verification is skipped for ALL elections (both private and public). Eligibility is enforced entirely by the backend's pre-verification check (TASK-010).

**Result for the merkle-proof endpoint:**
- `GET /api/voter/elections/:id/merkle-proof` returns `{ "merkle_proof": [] }` — an empty array always
- No Redis caching — not needed since proofs are always empty

**Why this decision:** The private election flow was simplified. Instead of matching voter wallet addresses to a pre-uploaded list, voters submit their student ID during pre-verification. The wallet address is not part of eligibility — the backend simply marks them as verified in the DB.

---

### TASK-009 — Smart Contract Deployment Pipeline ⚠️ Done Differently

**What the plan said:** Separate `/workers/jobs/deploy_jobs.py` with an RQ job `deploy_election_contract()`. Steps: load ABI/bytecode → deploy via web3 → wait for receipt → store contract address → update status to `scheduled`.

**What was actually built:** Combined into `lock_election_pipeline()` inside `backend/app/jobs/merkle_jobs.py`. No separate `deploy_jobs.py` file. The function handles both Merkle root computation and contract deployment together.

**Two deployment modes:**
- `BLOCKCHAIN_ENABLED=false` → `_mock_deploy_contract()` — returns a deterministic fake address, no Hardhat node needed
- `BLOCKCHAIN_ENABLED=true` → `_real_deploy_contract()` — deploys to local Hardhat node via web3.py, using raw transaction encoding (bypasses `eth_estimateGas` which crashes on Hardhat for dynamic array constructors)

**Why synchronous instead of RQ:** RQ uses `fork()` under the hood. On macOS, `fork()` combined with web3.py's internal C-level libraries causes SIGABRT (crash signal 6). So all background job code was refactored to run synchronously in the request handler.

---

### TASK-010 — Voter Pre-Verification Flow ✅ Done Differently

**What the plan said:** `POST /api/elections/:id/verify`. Private: check voter's `wallet_address` against `election_voters`. Public: enqueue RQ geo job → geocode address → shapely polygon check → write to DB.

**What was actually built:** `POST /api/voter/elections/:id/verify`

**Private election verification (actual):**
- Voter submits their `voter_id` (student ID string) in the request body
- Backend checks if that string exists in the `election_voters` table as `voter_identifier`
- If found → creates a `voter_verifications` record with `verified=True`
- **Difference from plan:** Plan matched on `wallet_address`. Actual matches on `voter_identifier` (student ID string).

**Public election verification (actual):**
- Voter submits `city` and/or `pincode` in the request body
- Backend does a simple text match against the `location_rules` JSON (districts, wards, pincodes lists)
- No RQ job, no shapely, no geocoding API call
- **GEO_MOCK is always true** — the real geocoding path exists in code but is never reached

---

### TASK-011 — Admin Dashboard UI ✅

**What the plan said:** Admin pages for listing elections, creating elections, managing candidates, uploading CSVs, locking elections, and viewing voter lists.

**What was actually built:** All planned admin pages exist:
- `AdminElectionsPage.jsx` — list with status badges
- `CreateElectionPage.jsx` — create form with type toggle and time pickers
- `AdminElectionDetailPage.jsx` — candidate management, CSV upload, lock, end, redeploy buttons

Matches the plan well.

---

### TASK-012 — Vote Casting Flow ✅ Mostly as Planned

**What the plan said (frontend):** Fetch `{abi, address}`, instantiate `ethers.Contract`, fetch Merkle proof, call `contract.vote(candidateId, proof)`, await receipt, POST tx hash to backend.

**What was actually built (`services/castVote.js`):**
1. Connect MetaMask (`connectWallet()`)
2. Fetch Merkle proof from backend (always returns `[]`)
3. Encode calldata using `ethers.Interface` (ABI encoder only — no Provider)
4. Send raw transaction via `window.ethereum.request({ method: 'eth_sendTransaction' })`
5. POST tx hash to `/api/votes/confirm`

**Key difference:** Uses `window.ethereum.request()` directly instead of `ethers.Contract`. This avoids creating an ethers.js `BrowserProvider`, which triggers polling that floods MetaMask with errors on a local Hardhat node. Functionally identical but the implementation path is different.

**Backend endpoint difference:**
- Plan: `POST /api/votes/record`
- Actual: `POST /api/votes/confirm`

**Security gap vs plan:** The plan said the backend should call `web3.eth.get_transaction(txHash)` to verify the transaction actually exists on-chain before recording it. The actual code does NOT do this — it trusts the tx hash provided by the frontend. For a demo this is fine; for production it would need on-chain verification.

---

### TASK-013 — Results & Audit View ✅

**What the plan said:** Frontend reads from `contract.getResults()`, bar chart with Recharts, contract address link, audit table.

**What was actually built (`ResultsPage.jsx`):**
- Fetches from `GET /api/voter/elections/:id/results` (DB source, always works)
- Also calls `fetchResultsFromChain()` via `eth_call` directly (on-chain source, optional)
- If on-chain data available → overrides DB counts (blockchain is more authoritative)
- Custom bar chart using Tailwind CSS `div` bars — **Recharts not used** (but works fine)
- Contract address displayed with Etherscan link ✅
- Vote audit table with tx hashes ✅

**Backend:** `GET /api/voter/elections/:id/results` — checks `BLOCKCHAIN_ENABLED` env, calls `getResults()` on contract if true, falls back to DB always. No Redis 60s TTL cache (planned in TASK-015 which is not done).

---

### TASK-014 — Background Worker Infrastructure ⚠️ Partial

**What the plan said:** Separate `/workers/` directory with `queue.py`, `merkle_jobs.py`, `deploy_jobs.py`, `geo_jobs.py`, `transition_jobs.py`. Run with `rq worker --with-scheduler`.

**What was actually built:**
- RQ `Queue` objects are initialized in `backend/app/__init__.py` ✅
- `backend/app/jobs/merkle_jobs.py` — lock pipeline + end election ✅
- `backend/app/jobs/csv_jobs.py` — CSV parsing ✅
- `backend/app/api/elections.py` — stores job IDs in Redis and `/job-status` poll endpoint ✅

**What is missing / different:**
- No separate `/workers/` directory — jobs live in the Flask app
- `deploy_jobs.py` — merged into `merkle_jobs.py`
- `geo_jobs.py` — geo verification is synchronous, no RQ job
- `transition_jobs.py` — state transitions are done inline by `_auto_transition_elections()` which runs on every voter-facing API call (lazy transition instead of scheduled job)
- **Workers are not actually running** — all jobs run synchronously in the request because of the macOS SIGABRT crash

---

### TASK-015 — Redis Caching Layer ❌ Not Done

**What the plan said:** `cache_service.py` with get/set functions for elections, verifications, results, contract ABI, Merkle proofs. TTLs on each key type.

**What was actually built:** Redis is connected and available via `extensions.redis_client`. The Flask-Limiter uses it for rate tracking. But **no caching logic has been implemented**. Every API request hits the database directly.

---

### TASK-016 — Geocoding & Constituency Verification ⚠️ Partial

**What the plan said:** `geo_service.py` with real geocoding API + `shapely` polygon intersection. RQ job for async geo verification.

**What was actually built:** Simple text matching in `voter_elections.py`:
- Voter submits `city` and `pincode`
- Backend checks if `city` is in `districts` list or `wards` list, or `pincode` is in `pincodes` list
- `GEO_MOCK=true` is the only mode that works

**What is not done:** No geocoding API calls, no shapely, no RQ geo job, no coordinate-based polygon intersection.

---

### TASK-017 — Integration Tests ❌ Not Done

No test files have been written. The plan specified:
- `pytest` backend tests
- Hardhat contract tests (`EVoting.test.js`)
- Cypress E2E tests

None of these exist in the codebase.

---

### TASK-018 — Security Hardening ⚠️ Partial

| Security Item | Planned | Status |
|---------------|---------|--------|
| Marshmallow request validation | ✅ | ❌ Not done — raw `request.get_json()` used |
| Rate limiting (Flask-Limiter) | ✅ | ⚠️ Wired up but no per-route limits set |
| Aadhaar bcrypt storage | ✅ | ❌ Aadhaar not collected in registration |
| JWT 1-hour expiry | ✅ | ❌ Set to 24 hours |
| Redis JWT blocklist for logout | ✅ | ❌ Not implemented |
| CORS restricted to frontend origin | ✅ | ❌ CORS is open (`CORS(app)`) |
| `nonReentrant` on `castVote()` | ✅ | ❌ Not added to contract |
| `onlyAdmin` on `endElection()` | ✅ | ✅ Done (`msg.sender == admin`) |
| Nonce-based wallet signature verification | ✅ | ❌ Wallet address stored without signature check |
| No raw SQL | ✅ | ✅ ORM used throughout |
| Secrets in `.env` | ✅ | ✅ Yes |

---

### TASK-019 — Deployment Config & Documentation ❌ Not Done

- No `docker-compose.yml`
- No `README.md`
- No `.env.example`
- No `flask seed-demo` CLI command
- `contracts/scripts/deploy.js` (Hardhat deploy script) — this **does** exist ✅

---

### TASK-020 — Demo Prep & Final Polish ⚠️ Partial

**What works end-to-end:**
1. Admin creates an election, adds candidates, uploads voter CSV, locks election → contract deployed
2. Voter registers, logs in, links MetaMask wallet
3. Voter pre-verifies eligibility by submitting student ID
4. Voter opens vote page, connects MetaMask, casts vote → MetaMask signs → tx hash recorded
5. Results page shows vote tallies (from DB, optionally from blockchain)

**What is rough or missing:**
- No seed script — admin account must be created manually in DB
- MetaMask network switch ✅ (handled in `web3.js`)
- No blockchain connection indicator in Navbar (planned, not done)
- Some loading and empty states are minimal

---

## Key Design Decisions That Differ From the Plan

These are not mistakes — they are deliberate choices made during development:

### 1. Firebase OTP → Email/Password
Firebase OTP requires real phone numbers and SMS configuration. Email/password is simpler for a college demo. The architecture still supports adding Firebase OTP later since the JWT middleware is the same.

### 2. RQ Worker → Synchronous Execution
The RQ worker crashes on macOS because web3.py's C-level code does not survive `fork()`. All job functions were rewritten to detect whether they're in a Flask request context and run inline if so. The RQ infrastructure is still wired — it would work on Linux/Docker.

### 3. Zero Merkle Root for All Elections
Instead of matching voter wallet addresses for Merkle eligibility, the system uses backend-enforced pre-verification (student ID check). The Merkle tree code is complete and correct, but the contract is deployed with a zero root so the on-chain proof step is skipped. The result is simpler: only pre-verified voters (as recorded in `voter_verifications`) can cast votes.

### 4. Lazy Status Transitions Instead of Scheduler
Instead of an RQ scheduler job (`transition_jobs.py`) that periodically updates election statuses, the function `_auto_transition_elections()` runs whenever any voter-facing endpoint is called. `scheduled → active` and `active → completed` transitions happen automatically at the right time without a background process.

### 5. Raw `window.ethereum.request()` Instead of ethers.js Provider
Creating an `ethers.BrowserProvider` in the browser causes MetaMask to start polling `eth_blockNumber` every few seconds. On a local Hardhat node this floods the console with `-32002` errors. All MetaMask interactions use `window.ethereum.request()` directly; ethers.js is only used as an ABI encoder.

---

## What Is Left to Build (Pending Work)

**Functionally required for a complete demo:**
1. `flask seed-demo` command — create admin + voters + sample elections in one command
2. Admin account creation script (currently must be done manually in DB)

**Security gaps (important for a real system, optional for demo):**
3. Nonce-based wallet signature verification (TASK-005)
4. On-chain TX verification before recording in `vote_transactions` (TASK-012)
5. JWT expiry reduced to 1h + Redis logout blocklist (TASK-018)
6. `nonReentrant` modifier on `castVote()` (TASK-018)
7. CORS restricted to frontend origin (TASK-018)

**Infrastructure (nice to have):**
8. Redis caching layer (TASK-015) — improves performance at scale
9. Docker compose setup (TASK-019) — makes it easy to run on any machine
10. Integration tests (TASK-017) — pytest + Hardhat + Cypress

**Real geocoding (optional for demo):**
11. Shapely polygon intersection for public elections (TASK-016)
