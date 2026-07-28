# Blockchain E-Voting Platform

A college e-voting platform where every vote is cast directly from the voter's own wallet and recorded immutably on-chain — the backend can verify eligibility, but it can never see, forge, or alter a vote.

Hybrid architecture: a Flask API handles identity, elections, and eligibility; an Ethereum smart contract is the single source of truth for vote counts.

---

## Why this exists

Campus and organizational elections today run on trust in whoever administers the ballot box. This platform removes that trust requirement for the one step that matters most — the vote itself:

- **Votes are self-custodied.** Voters sign and submit their vote from MetaMask. The backend never holds a private key and never submits a vote on anyone's behalf.
- **Vote counts are tamper-evident.** Counts live in a smart contract's storage, not a mutable database row.
- **Eligibility is provable, not just asserted.** Private elections use Merkle proofs so a voter can prove they're on the roll without the contract storing the full voter list. Public elections check a voter's registered address against the election's geographic boundary.
- **Double-voting is enforced on-chain**, keyed to the voter's wallet address — not by a backend flag that a bug could skip.

## How it works

```
React (MetaMask + ethers.js)
    │
    ├──  → JWT ──────────► Flask API ──► MySQL
    │                     (identity, elections,
    │                   candidates, eligibility)
    │
    └── Signed tx ───────────────────► Ethereum Smart Contract
                                        (vote storage, tallying,
                                         double-vote guard)
                                             │
                                             ▼
                                   Flask reads tx receipts
                                   into vote_transactions
```

**Two election types:**

| Type | Eligibility model |
|---|---|
| **Private** | Backend builds a Merkle tree from an uploaded voter-ID list; each voter submits a Merkle proof on-chain. The contract derives the leaf from `msg.sender`, so no one can claim another voter's slot. |
| **Public** | Backend checks whether the voter's registered address falls inside the election's geographic boundary (via `shapely`) — no proof needed at vote time. |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), ethers.js, MetaMask, TailwindCSS |
| Backend API | Python / Flask, SQLAlchemy, Flask-Migrate |
| Database | MySQL (SQLite fallback for local dev) |
| Auth | Phone OTP → JWT |
| Blockchain | Solidity, Hardhat, web3.py |
| Background jobs | Redis + RQ (Merkle tree generation, contract deployment, geocoding) |
| Geospatial | Shapely (public-election boundary checks) |

Full package-level breakdown: [`docs/techstack.md`](docs/techstack.md).

## Getting started

**Prerequisites:** Python 3.10+, Node 18+, MySQL, Redis, MetaMask browser extension.

```bash
# 1. Clone
git clone https://github.com/Manasakalkoti/blockhain-evoting.git
cd blockhain-evoting

# 2. Local blockchain (terminal 1)
npx hardhat node                     # Ethereum node on :8545

# 3. Backend (terminal 2)
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# create .env with DATABASE_URL, REDIS_URL, GEO_MOCK=true, Firebase creds
python run.py                        # Flask API on :5001

# 4. Background worker (terminal 3)
rq worker --with-scheduler default high low

# 5. Frontend (terminal 4)
cd frontend
npm install
npm run dev                          # Vite dev server
```

See [`docs/database-server-setup.md`](docs/database-server-setup.md), [`docs/redis-rq-setup.md`](docs/redis-rq-setup.md), and [`docs/blockchain-setup.md`](docs/blockchain-setup.md) for first-time environment setup.

## Project structure

```
blockchain-evoting/
├── backend/          Flask API — models, routes, background jobs
├── frontend/         React app (Vite)
├── contracts/        Solidity contracts + Hardhat config
├── workers/          RQ job definitions
├── docs/             Setup guides and architecture notes
└── EXECUTION_PLAN.md Full build roadmap
```

## Documentation

- [Tech stack detail](docs/techstack.md)
- [Frontend setup](docs/frontend-setup.md)
- [Database guide](docs/database-guide.md) · [migrations](docs/database-migrations.md)
- [Blockchain setup](docs/blockchain-setup.md)
- [Execution plan](EXECUTION_PLAN.md)

## Status

Actively in development. See [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) for what's shipped vs. planned.

## License

[MIT](LICENSE)
