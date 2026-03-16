# Blockchain E-Voting System — 2-Week Execution Plan

## Context
This is a college project building a blockchain-based e-voting platform. The system uses a hybrid architecture: a centralized Python Flask backend for user management and election administration, combined with Ethereum smart contracts for immutable vote recording, Merkle-tree-based eligibility proofs, and cryptographic non-repudiation. The platform supports two election types — **Private** (ID-based eligibility via CSV + Merkle trees) and **Public** (geography-based eligibility via geocoding + polygon intersection). Votes are cast directly from a voter's MetaMask wallet, ensuring the backend can never forge or alter votes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python Flask |
| Database | MySQL + SQLAlchemy (Flask-Migrate) |
| Cache | Redis |
| Background Jobs | Redis RQ |
| Blockchain | Ethereum (Solidity, Hardhat local node) |
| Frontend | React (Vite), ethers.js, MetaMask |
| Auth | Firebase PhoneAuth (OTP) + JWT |
| Geocoding | Google Maps or OpenCage API |

---

## Directory Structure

```
/blockchain-evoting
  /backend       — Flask app, models, services, API routes
  /frontend      — React app
  /contracts     — Solidity contracts + Hardhat config
  /workers       — RQ job definitions
```

---

## Task Registry

---

### TASK-001 — Project Setup & Dev Environment
**Week:** 1 | **Day:** 1 | **Effort:** 4h | **Deps:** None | **Critical Path:** YES

- Create monorepo: `/backend`, `/frontend`, `/contracts`, `/workers`
- Backend: Python venv, install Flask, SQLAlchemy, PyMySQL, redis-py, rq, web3.py, python-jose, firebase-admin, marshmallow, flask-cors, flask-limiter, shapely
- Frontend: React app (Vite), install ethers.js, React Router, Axios, TailwindCSS
- Contracts: `npm init` in `/contracts`, install Hardhat + OpenZeppelin contracts
- Configure `.env` (DB URL, Redis URL, Firebase creds, JWT secret, Geocoding API key)
- Start local MySQL + Redis; verify `npx hardhat node` on port 8545

---

### TASK-002 — Database Schema & Migrations
**Week:** 1 | **Day:** 1–2 | **Effort:** 4h | **Deps:** TASK-001 | **Critical Path:** YES

Tables (via Flask-Migrate / Alembic):

- `organizations` — id (UUID PK), name, type, created_at

- `users` — user_id (UUID PK), full_name, email (unique), password_hash, phone_number, aadhaar_hash, role ENUM('admin','voter'), wallet_address, organization_id (UUID FK → organizations), student_id (optional), employee_id (optional), address_line, city, state, pincode, latitude FLOAT, longitude FLOAT, status ENUM('active','suspended'), created_at
  > Note: `firebase_uid` is stored here during TASK-004 auth implementation (not in formal schema but required for Firebase OTP flow)

- `elections` — election_id (UUID PK), title, description TEXT, election_type ENUM('single_seat','multi_seat'), visibility_type ENUM('private','public'), start_time, end_time, eligibility_merkle_root, location_rule_hash, eligibility_locked BOOLEAN, candidates_locked BOOLEAN, candidate_list_hash, contract_address, contract_deployed_at TIMESTAMP, created_by_admin (UUID FK → users), status ENUM('draft','scheduled','active','completed'), results_published BOOLEAN, created_at
  > `election_type` (single/multi seat) and `visibility_type` (private/public) are separate fields. `candidate_list_hash` is generated when admin finalizes candidates (tamper-proof). `constituency_polygon` is NOT stored in DB — geographic rules are encoded in `location_rule_hash` and resolved at verification time via shapely.

- `constituencies` — constituency_id (UUID PK), election_id (UUID FK → elections), constituency_name, description TEXT, created_at
  > **New table.** Each election has one or more constituencies (e.g. "CSE Department", "Ward 24"). Candidates and voter lists are scoped to a constituency, not directly to an election.

- `candidates` — candidate_id (UUID PK), constituency_id (UUID FK → e), candidate_name, candidate_identifier (USN/Employee ID for validation), party_name, symbol_url, profile_photo, manifesto TEXT, candidate_position, status ENUM('active','withdrawn','disqualified'), created_at

- `election_voters` — id (UUID PK), constituency_id (UUID FK → constituencies), voter_identifier (raw ID from CSV), hashed_identifier, authorization_status ENUM('authorized'), created_at
  > Scoped to constituency (not election directly) to support multi-constituency elections.

- `voter_verifications` — id (UUID PK), user_id (UUID FK → users), election_id (UUID FK → elections), method ENUM('id_verification','address_verification'), verified BOOL, verified_at TIMESTAMP

- `vote_transactions` — transaction_id (UUID PK), election_id (UUID FK → elections), voter_id (UUID FK → users), wallet_address, candidate_id (UUID), blockchain_tx_hash (unique), timestamp TIMESTAMP

---

### TASK-003 — Solidity Smart Contract (EVoting.sol)
**Week:** 1 | **Day:** 1–3 | **Effort:** 12h | **Deps:** TASK-001 | **Critical Path:** YES

**File:** `/contracts/contracts/EVoting.sol`

Interface:
```solidity
constructor(uint startTime, uint endTime, string[] candidates, bytes32 merkleRoot, address admin)
vote(uint candidateId, bytes32[] merkleProof)   // nonReentrant
getResults() returns (uint[])                    // view
endElection()                                    // onlyAdmin
getElectionState() returns (uint8)               // view
```

State variables: `mapping(address=>bool) hasVoted`, `uint[] voteTallies`, `bytes32 merkleRoot`, `uint8 state`, `address admin`

Eligibility: if `merkleRoot != 0`, verify proof via OpenZeppelin `MerkleProof.verify()`; if `merkleRoot == 0` (public election), skip on-chain proof (pre-verification is backend-enforced).

Hardhat tests (`/contracts/test/EVoting.test.js`): deploy → vote → verify tallies; double vote rejection; invalid Merkle proof rejection; only admin can call endElection.

> **Critical note:** Leaf encoding must be `keccak256(abi.encodePacked(address))` — must match Python exactly.

---

### TASK-004 — Auth Backend (Firebase OTP + JWT)
**Week:** 1 | **Day:** 2–3 | **Effort:** 6h | **Deps:** TASK-001, TASK-002 | **Critical Path:** YES

Endpoints:
- `POST /api/auth/send-otp` — frontend calls Firebase SDK directly; backend stores pending verification
- `POST /api/auth/verify-otp` — receives Firebase ID token, verifies via `firebase_admin.auth().verify_id_token()`, creates/fetches user, issues JWT
- `POST /api/auth/admin/login` — email+password for pre-provisioned admin accounts
- `GET /api/auth/me` — returns profile from JWT

Middleware: `@require_auth` decorator (decode JWT, attach `g.user`), `@require_role('admin')` decorator.

CLI: `flask seed-admin` creates initial admin account.
Configure Firebase test phone numbers in Firebase console for dev (avoids real SMS).

---

### TASK-005 — Voter Registration & Wallet Linking
**Week:** 1 | **Day:** 3–4 | **Effort:** 5h | **Deps:** TASK-002, TASK-004 | **Critical Path:** YES

Endpoints:
- `POST /api/voters/register` — validate + hash Aadhaar (bcrypt), check uniqueness on aadhaar_hash, create user record
- `POST /api/voters/link-wallet` — voter signs nonce with MetaMask; backend recovers address via `web3.eth.account.recover_message()`, stores wallet_address
- `GET /api/voters/profile` — return voter profile

Validations: Aadhaar (12 digits), phone format, email uniqueness.

---

### TASK-006 — Election CRUD & Lifecycle APIs (Admin)
**Week:** 1 | **Day:** 3–5 | **Effort:** 8h | **Deps:** TASK-002, TASK-004 | **Critical Path:** YES

Endpoints:
- `POST /api/elections` — create (defaults to `draft`)
- `GET /api/elections` — list (admin: all; voter: eligible ones)
- `GET /api/elections/:id` — detail + contract address + ABI
- `PUT /api/elections/:id` — update (only in `draft`)
- `POST /api/elections/:id/candidates` — add candidate (only before candidates_locked)
- `DELETE /api/elections/:id/candidates/:cid`
- `POST /api/elections/:id/voters/upload` — CSV upload for private elections
- `POST /api/elections/:id/lock` — transitions draft → scheduled, enqueues Merkle + deploy jobs
- `POST /api/elections/:id/end` — admin ends active election

Service layer `ElectionService` enforces valid state transitions.

---

### TASK-007 — React App Scaffold & Auth UI
**Week:** 1 | **Day:** 3–5 | **Effort:** 5h | **Deps:** TASK-004 | **Critical Path:** YES

Structure: `/pages`, `/components`, `/context`, `/hooks`, `/api`

Implement:
- `AuthContext` — JWT storage, login/logout
- Firebase PhoneAuth OTP UI (multi-step: info → OTP → wallet link)
- Admin login page (email+password)
- `ProtectedRoute` component with role enforcement
- `Web3Context` — ethers.js provider, `connectWallet()`, `account`, `signer`
- MetaMask connect button in Navbar

---

### TASK-008 — Merkle Tree Generation Job (Private Elections)
**Week:** 1 | **Day:** 4–5 | **Effort:** 5h | **Deps:** TASK-006, TASK-014 | **Critical Path:** YES

**File:** `/workers/jobs/merkle_jobs.py`

RQ job `generate_merkle_tree(election_id)`:
1. Fetch all `hashed_identifier` rows from `election_voters` for the election
2. Build Merkle tree using `keccak256(abi.encodePacked(address))` encoding — `web3.solidity_keccak(['address'], [addr])`
3. Store Merkle root in `elections.merkle_root`
4. Cache all proofs in Redis: `evoting:merkle:{election_id}:{wallet_address}` (TTL until election ends)

Endpoint: `GET /api/elections/:id/merkle-proof` — returns voter's proof from Redis.

---

### TASK-009 — Smart Contract Deployment Pipeline
**Week:** 2 | **Day:** 6–7 | **Effort:** 6h | **Deps:** TASK-003, TASK-006, TASK-008 | **Critical Path:** YES

**File:** `/workers/jobs/deploy_jobs.py`

RQ job `deploy_election_contract(election_id)`:
1. Load compiled ABI + bytecode from `/contracts/artifacts/`
2. Deploy via `web3.eth.contract().constructor(...).transact({'from': deployer_wallet})` with admin private key from env
3. Wait for receipt
4. Store `contract_address` in `elections` table
5. Update state to `scheduled`
6. Cache `{abi, address}` in Redis: `evoting:contract:{election_id}`

Endpoint: `GET /api/elections/:id/contract` — returns `{abi, address}` for frontend.

---

### TASK-010 — Voter Pre-Verification Flow
**Week:** 2 | **Day:** 6–7 | **Effort:** 5h | **Deps:** TASK-005, TASK-006, TASK-007 | **Critical Path:** YES

Endpoint: `POST /api/elections/:id/verify`

**Private elections:** Check if `voter.wallet_address` is in `election_voters` for this election → create `voter_verifications` record.

**Public elections:** Enqueue `verify_voter_geo(user_id, election_id)` RQ job → geocode voter address → point-in-polygon against `elections.constituency_polygon` using `shapely` → write result to `voter_verifications`.

Cache result: `evoting:verification:{user_id}:{election_id}` (TTL until election end).

Frontend: ElectionDetail page shows "Verify Eligibility" button + status badge.

---

### TASK-011 — Admin Dashboard UI
**Week:** 2 | **Day:** 6–8 | **Effort:** 6h | **Deps:** TASK-006, TASK-007 | **Critical Path:** NO

Pages:
- `/admin/elections` — list with state badges (Draft, Scheduled, Active, Completed)
- `/admin/elections/new` — create form (type toggle, date pickers, constituency GeoJSON input for public)
- `/admin/elections/:id` — detail: candidate management, CSV upload, "Lock Election" + job status polling, "End Election"
- `/admin/elections/:id/voters` — eligibility list + verification statuses

Use React Query for data fetching + polling of job status after lock.

---

### TASK-012 — Vote Casting Flow (Frontend + Backend)
**Week:** 2 | **Day:** 7–9 | **Effort:** 12h | **Deps:** TASK-003, TASK-009, TASK-010, TASK-007 | **Critical Path:** YES

**Frontend** (`/frontend/src/pages/VotePage.jsx`):
1. Fetch `{abi, address}` from `GET /api/elections/:id/contract`
2. Instantiate: `new ethers.Contract(address, abi, signer)`
3. If private: fetch Merkle proof from `GET /api/elections/:id/merkle-proof`
4. Voter selects candidate → confirmation modal → calls `contract.vote(candidateId, proof)`
5. MetaMask popup → voter signs → await receipt
6. `POST /api/votes/record` with `{electionId, txHash, candidateId}`

**Backend** `POST /api/votes/record`:
- Verify TX exists on chain via `web3.eth.get_transaction(txHash)`
- Verify TX was sent to the correct contract address
- Verify voter has `voter_verifications.verified == true`
- Check no duplicate TX hash in `vote_transactions`
- Insert row into `vote_transactions`
- Invalidate results cache

Guard: vote page only loads if voter is pre-verified.

---

### TASK-013 — Results & Audit View
**Week:** 2 | **Day:** 8–9 | **Effort:** 4h | **Deps:** TASK-009, TASK-007 | **Critical Path:** NO (needed for demo)

**Frontend** (`/results/:electionId`):
- Call `contract.getResults()` via read-only `JsonRpcProvider`
- Display bar chart (Recharts) of tallies per candidate; highlight winner
- Show contract address with Hardhat explorer link
- Audit table: anonymized `vote_transactions` rows (tx_hash, block_number, cast_at)

**Backend** `GET /api/elections/:id/results`:
- Check Redis cache `evoting:results:{election_id}` (60s TTL)
- If miss: call `contract.getResults()` via web3.py, merge with candidate names, cache, return

---

### TASK-014 — Background Worker Infrastructure
**Week:** 1 | **Day:** 4–5 | **Effort:** 4h | **Deps:** TASK-001, TASK-002 | **Critical Path:** YES (partial)

Files:
- `/workers/queue.py` — Redis connection + RQ Queue instances (default, high, low)
- `/workers/jobs/merkle_jobs.py` — Merkle generation
- `/workers/jobs/deploy_jobs.py` — Contract deployment
- `/workers/jobs/geo_jobs.py` — Geocoding verification
- `/workers/jobs/transition_jobs.py` — Automated state transitions:
  - `scheduled AND start_time <= NOW()` → active
  - `active AND end_time <= NOW()` → call `endElection()` on contract → completed

Run: `rq worker --with-scheduler default high low`

Install `rq-dashboard` for job monitoring during development.

---

### TASK-015 — Redis Caching Layer
**Week:** 1 | **Day:** 5 | **Effort:** 3h | **Deps:** TASK-001 | **Critical Path:** NO

**File:** `/backend/services/cache_service.py`

Key schema: `evoting:{entity}:{id}:{field}`

Functions: `get/set_active_elections`, `get/set_voter_verification`, `get/set_election_results`, `get/set_contract_info`, `get/set_merkle_proof`, `invalidate_election(election_id)`.

Integrate into: elections list, results, contract ABI, verification status endpoints.

---

### TASK-016 — Geocoding & Constituency Verification (Public Elections)
**Week:** 2 | **Day:** 7–8 | **Effort:** 5h | **Deps:** TASK-006, TASK-014 | **Critical Path:** NO

**File:** `/backend/services/geo_service.py`

- `geocode_address(addr) → (lat, lng)` — calls Geocoding API; caches 24h in Redis
- `point_in_polygon(lat, lng, geojson_polygon) → bool` — uses `shapely`
- `verify_voter_constituency(user_id, election_id) → bool` — orchestrates both

RQ job `verify_voter_geo(user_id, election_id)`: geocode → polygon check → write to `voter_verifications` → update Redis cache.

Can be stubbed with env flag `GEO_MOCK=true` for demos without a real API key.

---

### TASK-017 — End-to-End Integration Tests
**Week:** 2 | **Day:** 9–10 | **Effort:** 6h | **Deps:** TASK-012, TASK-013 | **Critical Path:** YES

Test scenarios:
1. Private election full flow (admin creates → CSV → lock → deploy → voter pre-verifies → votes → results)
2. Double vote rejection (contract reverts)
3. Invalid Merkle proof (contract reverts)
4. State transitions (scheduler moves election states)
5. JWT expiry returns 401

Tools: pytest + Flask test client (backend); Hardhat tests (contracts); Cypress spec for voter vote-casting E2E flow.

---

### TASK-018 — Security Hardening
**Week:** 2 | **Day:** 9–10 | **Effort:** 4h | **Deps:** TASK-004, TASK-005, TASK-012 | **Critical Path:** NO

- Request validation: marshmallow schemas on all endpoints
- Rate limiting: Flask-Limiter (OTP: 5/min, registration: 10/hr per IP)
- Aadhaar: bcrypt-only storage enforced
- JWT: 1-hour expiry + Redis blocklist for logout
- CORS: restrict to frontend origin only
- Smart contract: verify `nonReentrant` on `vote()`, `onlyAdmin` on `endElection()`
- Wallet linking: nonce-based signature prevents replay
- No raw SQL string interpolation (ORM only)
- All secrets in `.env`, never committed

---

### TASK-019 — Deployment Config & Documentation
**Week:** 2 | **Day:** 10–11 | **Effort:** 5h | **Deps:** TASK-017 | **Critical Path:** NO

Deliverables:
- `docker-compose.yml` (MySQL, Redis, Flask API, React/nginx, RQ Worker)
- `contracts/scripts/deploy.js` (Hardhat deploy for local + Sepolia testnet)
- `README.md` (architecture diagram, setup steps, API reference table, full flow walkthrough)
- `flask seed-demo` CLI command (creates admin + 5 voters + 1 private + 1 public election)
- `.env.example`

---

### TASK-020 — Demo Prep & Final Polish
**Week:** 2 | **Day:** 11–12 | **Effort:** 4h | **Deps:** TASK-019 | **Critical Path:** NO

- Run seed data + full demo flow end-to-end
- Fix UI rough edges: loading states, error messages, empty states
- MetaMask network switch prompt for localhost:8545
- Blockchain connection indicator in Navbar
- 5–10 minute demo script:
  1. Admin: create election → upload CSV → lock → contract deployed (show Hardhat TX log)
  2. Voter: register → OTP → wallet link → pre-verify
  3. Vote: select candidate → MetaMask popup → TX hash shown
  4. Results: bar chart reading from blockchain

---

## Week-by-Week Schedule

### Week 1 (Days 1–5): Foundation

| Day | Tasks |
|-----|-------|
| Day 1 | TASK-001 (Env Setup), TASK-003 starts (Solidity) |
| Day 2 | TASK-002 (DB Schema), TASK-003 cont., TASK-004 starts (Auth) |
| Day 3 | TASK-004 complete, TASK-005 (Voter Reg), TASK-006 starts (Elections), TASK-007 starts (React) |
| Day 4 | TASK-005 complete, TASK-006 cont., TASK-007 cont., TASK-008 (Merkle), TASK-014 (Workers) |
| Day 5 | TASK-003 complete, TASK-006 complete, TASK-007 cont., TASK-008 complete, TASK-014 complete, TASK-015 (Redis) |

**Week 1 Goal:** Backend APIs functional, smart contract tests passing, RQ workers running, Merkle tree generation working, React app has auth + routing.

---

### Week 2 (Days 6–12): Integration & Polish

| Day | Tasks |
|-----|-------|
| Day 6 | TASK-009 (Contract Deploy), TASK-010 starts (Pre-Verify), TASK-011 starts (Admin UI) |
| Day 7 | TASK-009 complete, TASK-010 cont., TASK-011 cont., TASK-016 (Geocoding) |
| Day 8 | TASK-010 complete, TASK-011 cont., TASK-012 starts (Vote Casting) |
| Day 9 | TASK-012 complete, TASK-013 (Results), TASK-017 starts (Tests) |
| Day 10 | TASK-013 complete, TASK-017 cont., TASK-018 (Security) |
| Day 11 | TASK-017 complete, TASK-019 (Docs + Docker) |
| Day 12 | TASK-019 complete, TASK-020 (Demo Prep) |

**Week 2 Goal:** Full voting flow works end-to-end, admin dashboard complete, integration tests passing, documented, demo-ready.

---

## Critical Path

```
TASK-001 → TASK-003 → TASK-008 → TASK-009 ──┐
TASK-001 → TASK-002 → TASK-004 → TASK-005 ──┤
TASK-001 → TASK-002 → TASK-006 ─────────────┤
TASK-001 → TASK-014 ────────────────────────┤
                                             └→ TASK-012 → TASK-017 → TASK-019 → TASK-020
```

**Zero-slack tasks (must not slip):** TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-008, TASK-009, TASK-010, TASK-012, TASK-014, TASK-017

---

## Effort Summary

| Task ID | Name | Effort | Week |
|---------|------|--------|------|
| TASK-001 | Project Setup | 4h | 1 |
| TASK-002 | DB Schema | 4h | 1 |
| TASK-003 | Smart Contracts | 12h | 1 |
| TASK-004 | Auth Backend | 6h | 1 |
| TASK-005 | Voter Registration | 5h | 1 |
| TASK-006 | Election CRUD APIs | 8h | 1 |
| TASK-007 | React Scaffold + Auth UI | 5h | 1 |
| TASK-008 | Merkle Tree Job | 5h | 1 |
| TASK-009 | Contract Deployment Job | 6h | 2 |
| TASK-010 | Pre-Verification Flow | 5h | 2 |
| TASK-011 | Admin Dashboard UI | 6h | 2 |
| TASK-012 | Vote Casting Flow | 12h | 2 |
| TASK-013 | Results & Audit View | 4h | 2 |
| TASK-014 | Worker Infrastructure | 4h | 1 |
| TASK-015 | Redis Caching | 3h | 1 |
| TASK-016 | Geocoding (Public Elections) | 5h | 2 |
| TASK-017 | Integration Tests | 6h | 2 |
| TASK-018 | Security Hardening | 4h | 2 |
| TASK-019 | Deployment & Docs | 5h | 2 |
| TASK-020 | Demo Prep & Polish | 4h | 2 |
| **Total** | | **~118h** | |

---

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MetaMask/ethers.js integration complexity | HIGH | Build minimal voting prototype on Day 6 before connecting full pipeline |
| Merkle proof encoding mismatch Python ↔ Solidity | HIGH | Cross-language test: generate proof in Python, verify in Hardhat test suite |
| Firebase OTP requires real SIM in production | MEDIUM | Configure Firebase test phone numbers in console for dev |
| Hardhat node state resets on restart | MEDIUM | `flask seed-demo` re-deploys + re-seeds from scratch |
| Geocoding API quota/latency | LOW | `GEO_MOCK=true` env flag stubs geocoding for demo |
| RQ job failures silent | MEDIUM | Install rq-dashboard for job monitoring during dev |

---

## Verification (End-to-End Test Flow)

1. `npx hardhat node` — start local blockchain
2. `flask seed-demo` — create admin, voters, elections, deploy contracts
3. Import Hardhat account[0] into MetaMask; set network to localhost:8545
4. **Admin flow:** login → create election → upload voter CSV → lock → verify contract address stored in DB
5. **Voter flow:** register → OTP → link MetaMask wallet → pre-verify eligibility → vote → confirm TX hash in DB
6. **Double-vote:** repeat vote → MetaMask TX reverts → frontend shows error
7. **Results:** view results page → bar chart reads from blockchain → TX hashes listed in audit table
8. Run `pytest backend/tests/` — all API tests pass
9. Run `npx hardhat test` — all contract tests pass
