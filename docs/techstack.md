# Tech Stack

Complete list of technologies, libraries, and packages used in this project.
This file is updated as the project grows.

---

## Architecture Overview

```
React Frontend (MetaMask / Ethers.js)
    │
    ├── Firebase OTP → JWT → Flask API
    │       └── MySQL (users, elections, candidates, voter lists)
    │
    └── Web3 → Ethereum Smart Contract (votes stored on-chain)
                    └── Backend reads tx hashes → vote_transactions table
```

---

## Backend (Python / Flask)

### Framework & Server
| Package | Purpose |
|---------|---------|
| `flask` | Web framework |
| `flask-sqlalchemy` | ORM — model definitions and DB queries |
| `flask-migrate` | Database migrations (Alembic wrapper) |
| `flask-cors` | Cross-Origin Resource Sharing headers |
| `flask-limiter` | API rate limiting |

### Database
| Package | Purpose |
|---------|---------|
| `pymysql` | MySQL driver for SQLAlchemy |
| `mysql` (server) | Primary database — users, elections, candidates, voter lists |
| `sqlite` (fallback) | Dev fallback when `DATABASE_URL` is unset |

### Authentication & Security
| Package | Purpose |
|---------|---------|
| `python-jose[cryptography]` | JWT token creation and validation |
| `firebase-admin` | Firebase Admin SDK — phone OTP verification |
| `bcrypt` | Password hashing |

### Blockchain
| Package | Purpose |
|---------|---------|
| `web3` (web3.py v7) | Contract deployment, tx signing, receipt reading |
| `eth-abi` | Manual ABI encoding for constructor args (bypasses `eth_estimateGas`) |

### Background Jobs
| Package | Purpose |
|---------|---------|
| `rq` | Redis Queue — background job runner |
| `redis` | Redis client for job queue and caching |

### Geospatial
| Package | Purpose |
|---------|---------|
| `shapely` | Geographic polygon intersection for public election eligibility |

### Utilities
| Package | Purpose |
|---------|---------|
| `python-dotenv` | `.env` file loading |
| `marshmallow` | Schema validation |
| `click` | CLI commands (admin creation) |
| `csv`, `io`, `hashlib`, `uuid`, `datetime` | Python stdlib utilities |

---

## Frontend (JavaScript / React)

### Framework & Routing
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM rendering |
| `react-router-dom` | ^6.30.3 | Client-side routing |

### Blockchain & Web3
| Package | Version | Purpose |
|---------|---------|---------|
| `ethers` | ^6.16.0 | ABI encoding / decoding (Interface only — no Provider created to avoid polling) |
| MetaMask (browser ext) | — | Wallet — signs transactions via `window.ethereum.request` |

### Authentication
| Package | Version | Purpose |
|---------|---------|---------|
| `firebase` | ^12.10.0 | Firebase SDK — phone OTP login flow |

### HTTP & API
| Package | Version | Purpose |
|---------|---------|---------|
| `axios` | ^1.13.6 | API client for backend calls |

### Styling
| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^3.4.19 | Utility-first CSS framework |
| `postcss` | ^8.5.8 | CSS processing pipeline |
| `autoprefixer` | ^10.4.27 | Vendor prefix injection |

### Build & Dev Tools
| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^5.4.10 | Dev server and production bundler |
| `@vitejs/plugin-react` | ^4.3.3 | React fast refresh in Vite |
| `eslint` | ^9.13.0 | Linting |
| `eslint-plugin-react` | ^7.37.2 | React-specific lint rules |
| `eslint-plugin-react-hooks` | ^5.0.0 | Hooks lint rules |
| `eslint-plugin-react-refresh` | ^0.4.14 | Fast refresh lint rules |

---

## Smart Contracts (Solidity / Hardhat)

### Language & Runtime
| Tool | Version | Purpose |
|------|---------|---------|
| Solidity | 0.8.20 | Contract language |
| EVM target | `paris` | Required for Hardhat 2 — avoids `PUSH0` opcode (shanghai incompatibility) |
| Hardhat | ^2.28.6 | Local Ethereum node, compilation, testing |

### Hardhat Plugins (via hardhat-toolbox)
| Plugin | Purpose |
|--------|---------|
| `@nomicfoundation/hardhat-toolbox` | ^6.1.2 — bundles ethers, waffle, typechain, gas reporter, coverage |
| `@nomicfoundation/hardhat-ethers` | Ethers.js integration |
| `hardhat-gas-reporter` | Gas usage reporting |
| `solidity-coverage` | Code coverage for contracts |

### Network Configuration
| Network | Chain ID | RPC |
|---------|----------|-----|
| Hardhat local | 31337 | `http://127.0.0.1:8545` |
| Sepolia testnet | 11155111 | Alchemy / Infura (planned) |

### Contract: `EVoting.sol`
- Tracks candidates, vote counts, and `hasVoted` mapping
- Zero Merkle root = public election (no on-chain proof required)
- Non-zero Merkle root = private election (sorted-pair OpenZeppelin-compatible proof)
- `castVote(uint256 candidateId, bytes32[] merkleProof)` — voter signs directly from MetaMask
- `getResults()` — view function, free, returns candidate IDs and counts
- `endElection()` — admin-only

---

## Infrastructure

| Tool | Purpose |
|------|---------|
| MySQL | Primary relational database |
| Redis | Job queue backend (RQ), rate limiter storage |
| Firebase Auth | Phone number OTP verification |
| MetaMask | Browser wallet extension — voter identity and tx signing |
| Hardhat node | Local Ethereum blockchain for development |

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| No ethers `BrowserProvider` in frontend | Prevents automatic `eth_blockNumber` polling that floods MetaMask with `-32002` errors |
| All RQ jobs run synchronously in Flask request thread | RQ worker crashes on macOS with SIGABRT due to `fork()` + web3.py interaction |
| Zero Merkle root for all elections | Avoids wallet-address timing issue (voters may link wallet after admin locks election); eligibility enforced by backend pre-verification |
| `evmVersion: "paris"` | Hardhat 2 EVM does not support `PUSH0` opcode introduced in `shanghai` |
| Manual constructor ABI encoding | Bypasses `eth_estimateGas` which triggers `eth_call` simulation causing StackOverflow on Hardhat |
| Lazy election status transitions | No scheduler needed — statuses auto-update on each voter API fetch |
