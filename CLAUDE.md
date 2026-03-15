# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A college blockchain-based e-voting platform using a hybrid architecture: centralized Flask API for user management + Ethereum smart contracts for immutable vote recording. Votes are cast **directly from the voter's wallet** (MetaMask) — the backend can never forge or alter votes.

## Commands

### Backend (Python/Flask)
```bash
cd backend
python run.py                        # Start dev server on port 5001

# Database migrations (Flask-Migrate/Alembic)
flask db init                        # One-time: initialize migrations directory
flask db migrate -m "description"    # Generate migration from model changes
flask db upgrade                     # Apply pending migrations
```

### Workers (planned)
```bash
rq worker --with-scheduler default high low   # Start RQ background worker
```

### Smart Contracts (planned)
```bash
cd contracts
npx hardhat node       # Local Ethereum node on port 8545
npx hardhat test       # Run contract tests
npx hardhat compile    # Compile Solidity contracts
```

## Architecture

### Components and Interaction Model

```
React Frontend (MetaMask)
    │
    ├── Firebase OTP → JWT → Flask API
    │       └── MySQL (users, elections, candidates, voter lists)
    │
    └── Web3 → Ethereum Smart Contract (votes stored on-chain)
                    └── Backend reads tx hashes → vote_transactions table
```

**Two election types:**
- **Private**: ID-based eligibility. Backend generates a Merkle tree of eligible voter IDs; voters submit a Merkle proof to the smart contract to cast a vote anonymously.
- **Public**: Geography-based eligibility. Backend uses `shapely` to check if a voter's address polygon intersects the election's geographic boundary.

### Backend Structure (`backend/`)

- `app/__init__.py` — Flask app factory (`create_app()`), registers blueprints, initializes SQLAlchemy, Flask-Migrate, CORS
- `app/models/` — SQLAlchemy models; import all models here for Flask-Migrate auto-detection
- `app/api/` — Route blueprints (currently only `health.py`)
- `app/services/` — Business logic layer (empty, to be implemented)
- `run.py` — Entry point, calls `create_app()`

### Planned Database Tables
`organizations`, `users`, `elections`, `candidates`, `election_voters`, `voter_verifications`, `vote_transactions`

### Key Design Constraints
- Authentication: Firebase OTP for phone verification → JWT for subsequent API calls
- Voter wallet linking: Ethereum wallet address stored in `users.wallet_address`
- `GEO_MOCK=true` in `.env` bypasses real geocoding — keep this for local dev
- Background jobs (Redis/RQ) handle: contract deployment, Merkle tree generation, geocoding

### Environment Variables (`backend/.env`)
```
DATABASE_URL=mysql+pymysql://root:password@localhost:3306/evoting
REDIS_URL=redis://localhost:6379/0
GEO_MOCK=true
```
SQLite fallback is configured in `app/__init__.py` if `DATABASE_URL` is unset.

## Implementation Roadmap

See `EXECUTION_PLAN.md` for the full 20-task plan (~118h). Critical path:
1. DB schema & migrations (TASK-002)
2. Solidity voting contract (TASK-003)
3. Auth backend — Firebase + JWT (TASK-004)
4. Voter registration & wallet linking (TASK-005)
5. Election CRUD APIs (TASK-006)
6. Merkle tree generation (TASK-008)
7. Contract deployment pipeline (TASK-009)
8. Pre-verification flow (TASK-010)
9. Vote casting flow (TASK-012)
