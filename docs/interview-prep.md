# Interview Preparation Guide — Blockchain E-Voting System

This document covers everything studied so far, the practical tests to run,
and the interview questions you must be able to answer confidently.

---

## Topics Covered So Far

### 1. Project Architecture
- What problem this app solves — trustless voting using blockchain
- The 3 systems — React Frontend, Flask Backend, Ethereum Smart Contract
- How they talk to each other
- Why votes go to the blockchain and not the database

### 2. Database & Models
- What a model is — a Python class that represents a database table
- All 8 tables and what each one stores
- How SQLAlchemy turns a Python class into a real MySQL table
- What `__init__.py` does in the models folder and why it is required

### 3. Database Relationships
- **Foreign Key** — a real column that links two tables
- **db.relationship** — a Python shortcut to navigate between objects
- **back_populates** — connects both sides of a relationship and keeps them in sync
- **lazy="dynamic"** — do not fetch related data until explicitly asked
- **cascade="all, delete-orphan"** — when parent is deleted, delete children automatically

### 4. Database Migrations
- What a migration is — a version-controlled change to the database schema
- `flask db migrate` — detects changes in models and generates a migration file
- `flask db upgrade` — applies the migration to the actual database
- `flask db downgrade` — rolls back the last migration
- The full cycle — edit model → migrate → upgrade

### 5. Smart Contract — EVoting.sol
- What a smart contract is and why it cannot be altered once deployed
- State variables — what the contract stores permanently on the blockchain
- `uint256` — unsigned 256-bit integer, the default number type in Solidity
- `mapping` — key-value store, same as a Python dictionary
- `address` — Ethereum wallet address data type
- `bytes32` — 32-byte fixed size data, used for hashes and Merkle root
- `bool` — True or False
- `memory` vs `storage` — temporary vs permanent data
- `external` vs `internal` — who can call a function
- `view` — read-only function, costs zero gas
- `require()` — validation that rejects a transaction if condition fails
- `msg.sender` — the wallet address that called the function, cannot be faked
- `emit` — fires an event that gets recorded in the transaction log

### 6. DSA in This Project
- **Merkle Tree** — the only complex DSA concept used
- **Arrays** — `uint256[] candidateIds` for storing candidate list
- **Hash Maps** — `mapping(uint256 => uint256) voteCounts` and `mapping(address => bool) hasVoted`
- **Loop** — used in `getResults()` and `_validCandidate()`

### 7. Git Branching
- Creating a branch — `git checkout -b branch-name`
- Switching branches — `git checkout main`
- Viewing branches — `git branch`
- Why branches matter — experiment without breaking working code

### 8. Auth API — auth.py

**6 routes in auth.py:**
- `POST /api/auth/register` — creates a new voter account, role always hardcoded to `"voter"`
- `POST /api/auth/login` — voter login, returns JWT token
- `POST /api/auth/admin/login` — admin login, filters `role="admin"` in DB query
- `PUT /api/auth/wallet` — links MetaMask wallet address to the logged-in voter
- `GET /api/auth/profile` — returns full profile of the logged-in user
- `PUT /api/auth/profile` — updates allowed fields only (whitelist)

**3 helper functions:**
- `_hash_password(password)` — runs bcrypt on the plain password, returns hash
- `_check_password(password, hashed)` — compares plain password against stored hash
- `_make_jwt(user)` — builds a JWT with `sub` (user_id), `role`, and `exp` (expiry)

**Key security concepts:**
- `role="voter"` is hardcoded in register — even if the frontend sends `"role": "admin"` it is ignored
- Admins are created directly in the database (seeded) — not through the public register API
- `updatable` whitelist in `update_profile` — only listed fields can be changed; `role`, `email`, `password_hash` are deliberately excluded
- `setattr(user, field, value)` — dynamically sets a field on an object inside a loop, equivalent to writing `user.city = value` but works for any field name
- `silent=True` in `get_json()` — if the request body is missing or malformed, return `None` instead of crashing; the `or {}` then turns `None` into an empty dict
- Ethereum wallet regex `r'^0x[0-9a-f]{40}$'` — validates the wallet address format before saving it
- `wallet_address` starts as `null` for every new user — it is only set when the voter explicitly links their MetaMask wallet

### 9. Elections API — elections.py

**Helper functions (not routes — just formatters):**
- `_candidate_dict(c)` — converts a Candidate object to a plain dictionary for JSON
- `_constituency_dict(c)` — converts a Constituency object to a plain dictionary
- `_election_summary(e)` — basic election fields only
- `_election_detail(e)` — full election: loops all constituencies → collects all candidates → counts voters → returns everything in one dictionary
- `**_election_summary(election)` — the `**` spreads all key-value pairs from one dict into another (avoids repeating fields)
- `json.loads()` — converts a JSON string stored in DB back into a real Python dictionary

**Routes:**
- `GET /api/elections` — list all elections, calls `_auto_transition_elections()` first to update statuses
- `POST /api/elections` — create election, always starts as `status="draft"`, auto-creates one default "General" constituency
- `GET /api/elections/<election_id>` — get one election by ID from the URL
- `PUT /api/elections/<election_id>` — partial update, only changes fields that were sent
- `DELETE /api/elections/<election_id>` — delete, only allowed on draft elections
- `POST /api/elections/<election_id>/lock` — validates → builds Merkle tree → deploys contract → saves contract_address
- `POST /api/elections/<election_id>/end` — calls `endElection()` on the smart contract
- `POST /api/elections/<election_id>/redeploy` — clears contract_address, resets to draft, redeploys (dev helper)
- `GET /api/elections/<election_id>/voters` — lists all uploaded CSV voters + verified count
- `GET /api/elections/<election_id>/audit` — compares DB vote tally vs blockchain tally, returns match: True/False

**Key concepts:**
- `<election_id>` in the URL is a URL parameter — Flask extracts it automatically and passes it into the function
- Every write operation checks `status == "draft"` first — once locked, the election is read-only
- `db.session.flush()` — sends the INSERT to DB without committing, used to get the `election_id` immediately so the default constituency can be created in the same request
- Partial update pattern — individual `if field in data` blocks so only sent fields are changed
- `datetime.fromisoformat()` — converts an ISO string like `"2026-08-01T10:00:00"` into a Python datetime object
- `BLOCKCHAIN_ENABLED` feature flag in `.env` — switch to turn blockchain calls ON or OFF without changing code
- ABI (Application Binary Interface) — the menu of all functions in the smart contract, stored in `EVoting.json` after Hardhat compilation. Without it Python cannot call any contract function
- `.call()` in Web3 — read-only interaction with the contract, no transaction created, no gas spent
- Transaction vs Call — casting a vote is a transaction (writes to blockchain, costs gas). Reading results is a call (reads only, free)
- Audit route compares two tallies: DB `vote_transactions` rows vs `getResults()` from the contract. If they don't match, the database was tampered with

**Election lifecycle:**
```
draft → scheduled → active → completed
```
- `draft` — admin is setting up
- `scheduled` — locked and deployed, waiting for start_time
- `active` — voting open (auto transition when start_time passes)
- `completed` — voting ended (auto transition when end_time passes)

**Candidates API — candidates.py:**
- Only 2 routes: add candidate and remove candidate
- Both check `candidates_locked` and `status == "draft"` before doing anything
- If no `constituency_id` is sent, automatically uses the first (default) constituency
- `candidate_position` is auto-assigned: finds the current highest position in that constituency and adds 1
- Security check on delete: verifies the candidate actually belongs to this election before deleting

**Key Python patterns used in candidates.py:**
- `request.get_json(silent=True) or {}` — reads JSON body safely. `silent=True` returns `None` if body is missing or broken. `or {}` converts `None` to empty dict so `data.get(...)` never crashes
- `strip()` — removes whitespace from beginning and end of a string. `"  hello  ".strip()` → `"hello"`. Used on every field before saving to database
- `(data.get("field") or "").strip() or None` — three step pattern for optional fields:
  1. Get value, might be `None`
  2. `or ""` — if `None` use empty string
  3. `.strip()` — remove spaces
  4. `or None` — if result is empty string `""`, store `NULL` instead
- Why `or None` matters — `NULL` and `""` are different in the database. Optional fields should always store `NULL` when empty, never `""`. Storing `""` causes inconsistency: some rows have `NULL`, others have `""`, and queries checking `IS NULL` would miss the `""` rows
- `candidate_name` does NOT use `or None` because it is required — the `if not candidate_name` check below catches the empty case and returns 400
- `db.func.max(Candidate.candidate_position).scalar() or 0` — finds the highest position number currently in the constituency. `.scalar()` returns a single value instead of a full query object. `or 0` handles the case where no candidates exist yet (max returns NULL)
- Why `candidate_position` exists — the smart contract does not know names, only integers. `castVote(2)` means vote for whichever candidate has position 2. The database links the name "Rahul Gandhi" to position 2. The blockchain stores 2's vote count. The frontend combines both to show "Rahul Gandhi — 12 votes"

### 10. Voters API — voters.py

**2 routes only:**
- `POST /api/elections/<election_id>/voters/upload` — admin uploads a CSV file of eligible voter IDs
- `DELETE /api/elections/<election_id>/voters` — admin wipes all uploaded voter records so a fresh CSV can be re-uploaded

**3 guard checks on upload (in order):**
1. `status != "draft"` — can't upload voters after election is locked
2. `eligibility_locked` — once voter list is frozen, no more uploads
3. `visibility_type != "private"` — CSV upload is only for private elections; public elections use geography

**Key concepts:**
- `request.files` — Flask's way of reading uploaded files (not JSON body). The file comes as a multipart form upload, not JSON
- `.read().decode("utf-8", errors="replace")` — reads raw file bytes and converts to text. `errors="replace"` means if there's a weird character it is replaced instead of crashing the server
- Lazy import inside function — `from app.jobs.csv_jobs import process_csv_upload` is inside the function body, not at the top. Avoids circular import errors at startup. The import only happens when the function is actually called
- RQ skipped on macOS — the CSV job runs directly (`process_csv_upload(...)`) instead of being queued in Redis/RQ because RQ crashes on macOS with signal 6 (SIGABRT). Comment in code explains this
- `.delete()` on a query — deletes all matching rows at once and returns the count of deleted rows. `ElectionVoter.query.filter_by(...).delete()` deletes rows, not columns
- f-string — `f"Cleared {deleted} voter records"` — the `{}` is a placeholder that puts the variable value directly into the string at runtime

**`db.session.commit()` explained:**
- Think of it like a shopping cart: `add()` puts item in cart, `delete()` marks item for removal, `commit()` actually checks out — changes hit the database for real
- Until `commit()` is called, nothing is permanently saved. If the server crashes before commit, nothing changes

**`jsonify()` explained:**
- Converts a Python dictionary into a JSON response the frontend can read
- Also sets the `Content-Type: application/json` header so the browser knows what it received
- Without it, returning a plain Python dict would confuse Flask

**`curl` flags explained:**
- `-s` (silent) — hides the progress bar and speed stats curl normally shows. You only see the actual response
- `-H` (header) — attaches a header to the request. Used for `Authorization: Bearer TOKEN` on every protected route. Multiple `-H` flags can be stacked

### 11. Votes API — votes.py

**1 route only:**
- `POST /api/votes/confirm` — called by the frontend AFTER MetaMask has signed and broadcast the vote transaction. The backend saves the transaction hash for the audit trail.

**Key principle:**
The blockchain is the source of truth. The actual vote is already on the blockchain before this endpoint is called. This route only saves the receipt (tx hash) to MySQL for UX and auditability.

**Guard checks in order:**
1. All 4 fields must be present: `election_id`, `tx_hash`, `candidate_id`, `wallet_address`
2. `tx_hash` must be `0x` + 64 hex characters = 66 total characters
3. Election must exist and be `active` — votes cannot be recorded before start or after end
4. Voter must have been pre-verified for this election

**Why check `status == "active"` even though the vote is already on-chain:**
The blockchain has its own time checks too. This is the backend's own layer of defence — it protects the database record. Someone could try to submit a confirm call before the election opens or after it closes.

**Idempotent design — two safety nets:**
1. If the exact same `tx_hash` already exists in the DB → return success without saving again (handles frontend retries/timeouts)
2. If this voter already has ANY vote recorded for this election → return the existing record (one voter, one vote)
- **Idempotent** means calling the same thing multiple times gives the same result as calling it once

**`not all([...])` pattern:**
```python
if not all([election_id, tx_hash, candidate_id, wallet_address]):
```
`all([...])` returns `True` only if every item is truthy. `not all(...)` catches any missing field in one line instead of four separate `if not field` checks.

**`db.session.add(vt)` — why needed:**
Creating `vt = VoteTransaction(...)` only makes a Python object. SQLAlchemy does not know about it yet. `db.session.add(vt)` tells SQLAlchemy to track it. `db.session.commit()` then saves it to MySQL.
- Only new objects need `add()`. Objects fetched from the database are already tracked — just change a field and commit.

### 12. Frontend — AuthContext.jsx

**File location:** `frontend/src/context/AuthContext.jsx`

**What is AuthContext:**
A shared container that holds the logged-in user's data and makes it available to every page in the app. In React, each page is a separate component and they don't automatically share data. AuthContext solves this — instead of passing the user object manually from page to page, any page can just ask the context directly.

Think of it like a notice board in an office:
- `login()` pins your name to the notice board
- `logout()` removes your name
- `useAuth()` is any page looking at the notice board

**Key parts:**
- `createContext(null)` — creates the empty container. `null` is just the starting value meaning "no user yet"
- `AuthProvider` — the wrapper component that fills the container and wraps the entire app. All pages inside it can access the user data via `{children}`
- `useState` — React's special variable that remembers a value AND updates the screen when it changes. Normal JS variables are forgotten on re-render; `useState` persists
- `localStorage.getItem('user')` on startup — checks if a user was already saved from a previous login. If yes, restores the session so you stay logged in after refreshing
- `login(userData, token)` — saves token + user to localStorage, then calls `setUser()` to update the screen immediately
- `logout()` — removes token + user from localStorage, sets user to `null`, screen resets
- `useCallback` — wraps login/logout so they are not recreated on every render (performance)
- `user?.role === 'admin'` — optional chaining. If `user` is null, doesn't crash. Returns true/false for isAdmin
- `useAuth()` — shortcut any page uses to read from the context: `const { user, login, logout, isAdmin } = useAuth()`

**Difference between AuthContext and AuthProvider:**
- `AuthContext` = the empty box (`createContext`)
- `AuthProvider` = fills the box with data and shares it with the app
- `useAuth()` = opens the box and reads from it

### 13. Frontend — api/client.js

**File location:** `frontend/src/api/client.js`

**What it does:**
A pre-configured axios instance that every page uses to make API calls to the Flask backend. axios is the browser equivalent of curl — same job, different environment.

**curl vs axios:**
- `curl` — you manually type a command in terminal. Used for testing and debugging. The human triggers it
- `axios` — runs inside React. A button click or page load triggers it automatically. The user never sees it

Both send HTTP requests to the same Flask backend. The difference is who triggers it — human via terminal vs JavaScript via button click.

**Key parts:**
- `axios.create({ baseURL })` — creates a custom axios instance with the Flask server URL pre-set. Every page just writes `/api/auth/login` instead of the full URL
- `import.meta.env.VITE_API_URL` — reads the backend URL from `.env` file. Same concept as `os.environ.get()` in Python
- `api.interceptors.request.use(...)` — runs automatically before EVERY request. Reads the JWT token from localStorage and attaches it as `Authorization: Bearer TOKEN`. No page has to manually add the token
- Without the interceptor — every page would need to manually write `-H "Authorization: Bearer TOKEN"` on every API call
- With the interceptor — it just happens automatically, every time

**How pages use it:**
```javascript
import api from '../api/client'
api.post('/api/auth/login', { email, password })   // login
api.get('/api/elections')                           // list elections
api.put('/api/auth/wallet', { wallet_address })     // link wallet
```

### 14. Frontend — castVote.js (The Complete Voting Flow)

**File location:** `frontend/src/services/castVote.js`

**What it does:**
The single most important frontend file. Handles the entire voting flow in one function — from connecting MetaMask to recording the tx hash in the backend.

**Key principle from the top comment:**
- The backend NEVER signs the transaction — only the voter's MetaMask wallet does
- This is the entire security guarantee of the system

**The 5 steps inside `castVote()`:**
1. Connect MetaMask wallet → get voter's wallet address
2. Fetch Merkle proof from backend (skipped for public elections, proof = `[]`)
3. Encode the vote as raw bytes using ethers ABI interface
4. Send transaction via MetaMask → voter sees confirmation popup → MetaMask broadcasts to blockchain → returns `txHash`
5. Send `txHash` to backend `/api/votes/confirm` to save receipt in MySQL

**Key concepts:**
- `window.ethereum` — MetaMask injects itself into the browser as this object. This is how JavaScript talks to MetaMask
- `CAST_VOTE_IFACE` — a mini-ABI with just the `castVote` function definition. Used only for encoding the function call into raw bytes the blockchain understands
- `encodeFunctionData('castVote', [candidatePosition, merkleProof])` — converts the function call into a hex string that goes into the transaction's `data` field
- `VOTE_GAS_LIMIT = '0x55730'` — pre-set gas limit (350,000) so MetaMask skips `eth_estimateGas` which is another RPC call that can fail under load
- `onStatusChange` — a callback function passed in from the Vote page. Used to update the UI with messages like "Connecting wallet…", "Waiting for MetaMask…", "Recording vote…" without the service file touching React

**`sendTransaction()` retry logic:**
- MetaMask constantly pings Hardhat in the background asking "what's the latest block?" (dozens of times per second — needed for showing balance, gas prices, pending tx status)
- Hardhat is a lightweight local node — gets overwhelmed by background pings + a real transaction at the same time
- Error `-32002` = RPC backoff — node saying "too many requests, slow down"
- **RPC** = Remote Procedure Call — how JavaScript sends commands to the blockchain node
- **Backoff** = when a server is overloaded it tells the caller to wait before retrying
- The retry loop (3 attempts, 32s wait each) is written in the code — not MetaMask. MetaMask just sends or fails
- 32 seconds because MetaMask's internal backoff timer resets after ~30 seconds
- 3 attempts because sometimes once isn't enough after the node calms down
- After 3 failures → `throw err` → Vote page catches it → shows error message → voter tries again manually
- This problem only happens on Hardhat locally. On testnets or mainnet, `-32002` never occurs

**Gas fees:**
- On Hardhat local / testnets — fake ETH, zero real cost
- On Ethereum mainnet — voter's MetaMask wallet pays real gas fees in ETH
- This project runs on Hardhat locally and testnets — no real money involved

**Testnets vs Hardhat:**
- Hardhat — runs only on your laptop, dies when terminal closes, only you can see it
- Testnet (e.g. Sepolia) — real global network, fake ETH (free from faucets), permanent, anyone can connect
- Mainnet — real Ethereum, real ETH, real money, production

### 15. Middleware & Authentication Flow
- What middleware is — a security check that runs BEFORE the actual API function
- `_extract_payload()` — private helper that reads and verifies the JWT from the Authorization header
- `require_jwt` — decorator that allows any logged in user (voter or admin)
- `require_admin` — decorator that allows only admins, returns 403 if role is not admin
- `g` — Flask's temporary bag that stores `user_id` and `role` for the duration of one request
- `@wraps(f)` — preserves the original function's name so Flask routing does not break
- `*args, **kwargs` — makes the decorator flexible enough to wrap any function regardless of its arguments
- `try/except` — prevents the server from crashing when token verification fails
- `None` — used as a signal meaning "no error" in the return value pair `(payload, None)`
- HTTP status codes — 401 means Unauthorized (not logged in), 403 means Forbidden (logged in but no permission)
- Why decorators — write security check once, reuse it across all protected endpoints
- The Authorization header — `Authorization: Bearer TOKEN` sent with every request after login
- Token stored in `localStorage` in the browser after login

---

## Practical Tests to Run

Do each of these yourself. Reading is not enough — you must run it.

---

### Test 1 — Add a column with a default value
Add `is_verified` Boolean column with default `False` to the `users` table.
Run the migration, verify it in MySQL, then roll it back.

```bash
# In backend/app/models/user.py add:
is_verified = db.Column(db.Boolean, default=False, nullable=False)

# Then run:
cd backend
flask db migrate -m "add is_verified to users"
flask db upgrade

# Roll back:
flask db downgrade
```

**What you learn:** Full migration cycle with default values.

---

### Test 2 — Query the database using Flask shell

```bash
cd backend
flask shell
```

Then run these one by one:

```python
from app.models.user import User
from app.models.election import Election

User.query.all()                          # all users
User.query.filter_by(role="admin").all()  # only admins
User.query.filter_by(role="voter").count() # count voters
Election.query.first()                    # first election
Election.query.filter_by(status="active").all() # active elections
```

**What you learn:** ORM queries without writing raw SQL.

---

### Test 3 — Look at your database directly in MySQL

```bash
mysql -u root -p evoting
```

Then:

```sql
SHOW TABLES;
DESC users;
DESC elections;
SELECT * FROM users;
SELECT * FROM elections;
SELECT email, role FROM users;
```

**What you learn:** Every developer must be able to inspect their own database directly.

---

### Test 4 — Navigate relationships in Flask shell

```python
from app.models.election import Election

e = Election.query.first()
print(e.created_by)                # User object who created this election
print(e.created_by.full_name)      # their name — navigating the relationship
print(e.constituencies.all())      # all constituencies of this election
print(e.constituencies.count())    # how many constituencies
```

**What you learn:** How ORM relationships work in practice — no SQL joins needed.

---

### Test 5 — Break and fix cascade (already done)
You already did this. You removed `cascade="all, delete-orphan"` and got:
```
(1048, "Column 'election_id' cannot be null")
```
You learned that without cascade, SQLAlchemy tried to orphan the constituency
instead of deleting it, and MySQL rejected that because `election_id` is `nullable=False`.

**What you learned:** Data integrity — a child row cannot exist without its parent.

---

### Test 6 — Decode a JWT token
Login via API and copy your token:

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email", "password": "your-password"}'
```

Paste the token at:
```
https://jwt.io
```

You will see the decoded payload:
```json
{
  "sub": "user-uuid-here",
  "role": "voter",
  "exp": 1234567890
}
```

**What you learn:** What is actually inside a JWT token — user ID, role, expiry.

---

### Test 7 — Hit every API endpoint manually using curl or Postman

```bash
# Register a new voter
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name": "Test Voter", "email": "test@test.com", "password": "test123"}'

# Login
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "test123"}'

# Get profile (use token from login)
curl http://localhost:5001/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# List elections (admin token required)
curl http://localhost:5001/api/elections \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN_HERE"
```

**What you learn:** Testing your own APIs manually — essential for debugging.

---

### Test 8 — Git branch, change, merge

```bash
git checkout -b test-branch          # create and switch to new branch
# make any small change to any file
git add .
git commit -m "test commit"
git checkout main                    # go back to main
git merge test-branch                # merge changes in
git branch -d test-branch            # delete the branch
```

**What you learn:** The full git feature branch workflow used in every company.

---

### Test 9 — Read contract state from Hardhat console
When Hardhat node is running and an election is deployed:

```bash
cd contracts
npx hardhat console --network localhost
```

Then:

```javascript
const contract = await ethers.getContractAt("EVoting", "YOUR_CONTRACT_ADDRESS")
await contract.candidateIds(0)           // first candidate ID
await contract.startTime()               // start timestamp
await contract.ended()                   // is election ended?
await contract.hasVoted("0x...")         // has this wallet voted?
await contract.getResults()              // full results
```

**What you learn:** Interacting with a deployed contract directly, not through the UI.

---

### Test 10 — Check git history and understand what changed

```bash
git log --oneline                        # see all commits
git show HEAD                            # see what the last commit changed
git diff main..learning-experiments      # compare two branches
git status                               # see current uncommitted changes
```

**What you learn:** Reading git history is how developers understand a codebase.

---

## Interview Questions — Be Ready to Answer All of These

These are real questions asked in backend, blockchain, and full-stack interviews.
Practice answering each one out loud in your own words.

---

### Database & ORM

**Q1. What is the difference between a foreign key and a relationship?**

A foreign key is an actual column in the database that stores another table's ID and creates a hard link between tables. A relationship is a Python-level shortcut that SQLAlchemy gives you to navigate between objects — it creates no column in the database.

---

**Q2. What does `cascade="all, delete-orphan"` do and why is it needed?**

It tells SQLAlchemy to automatically delete child records when the parent is deleted. It is needed because a child with `nullable=False` on its foreign key cannot exist without a parent — the database would throw an integrity error if the parent is deleted and the child is left behind.

---

**Q3. What is `lazy="dynamic"` and when would you use it?**

It means do not fetch the related records from the database until explicitly asked. Instead of returning a list, it returns a query object that you can filter, count, or paginate. Use it when a relationship could return many rows — like all elections created by an admin or all votes in an election.

---

**Q4. What is `back_populates` and why do both sides need it?**

`back_populates` tells SQLAlchemy the name of the matching relationship on the other model. Both sides need it so that when you change one side, SQLAlchemy automatically updates the other side too — keeping both in sync without an extra database call.

---

**Q5. What is a migration and why do we need it?**

A migration is a version-controlled file that describes a change to the database schema. We need it because you cannot just change a model file and expect the database to update automatically — you need to run a migration to apply the change to the actual database. Migrations also let you roll back changes if something goes wrong.

---

**Q6. What is the difference between `flask db migrate` and `flask db upgrade`?**

`flask db migrate` detects changes in your model files and generates a migration file — but does not apply it yet. `flask db upgrade` actually runs that migration file and applies the changes to the database. You always run migrate first, then upgrade.

---

### Authentication

**Q7. What is a JWT token and what is inside it?**

JWT stands for JSON Web Token. It is a string with three parts separated by dots. The middle part contains a JSON payload with the user's ID, role, and expiry time. The backend signs it with a secret key so it cannot be tampered with. The frontend sends it in every request as proof of identity.

---

**Q8. Why do we hash passwords before storing them?**

Because if the database is stolen, the attacker gets the hash — not the real password. A hash is a one-way function — you cannot reverse it to get the original password. We use bcrypt which also adds a random salt so two identical passwords produce different hashes.

---

### Solidity & Smart Contracts

**Q9. What is `uint256` in Solidity?**

An unsigned 256-bit integer. Unsigned means only positive numbers. 256 bits means it can store numbers up to 2²⁵⁶ - 1. It is the default number type in Solidity because the Ethereum Virtual Machine works natively with 256-bit numbers.

---

**Q10. What does a `mapping` do in Solidity?**

A mapping is a key-value store — same concept as a Python dictionary. It gives O(1) lookup — instant access regardless of how many entries exist. In this contract, `mapping(address => bool) hasVoted` stores whether each wallet has already voted, and `mapping(uint256 => uint256) voteCounts` stores the vote count per candidate.

---

**Q11. What is `msg.sender` and why can it not be faked?**

`msg.sender` is the Ethereum wallet address that signed and sent the transaction. Ethereum cryptographically verifies every transaction signature — only the owner of a private key can produce a valid signature for their wallet address. The contract receives `msg.sender` from Ethereum itself, not from the caller — so it is impossible to fake.

---

**Q12. What is the difference between `storage` and `memory` in Solidity?**

`storage` is permanent — data saved in storage lives on the blockchain forever and costs gas to write. `memory` is temporary — data exists only while the function is running and is discarded afterwards. Use `memory` for function parameters and return values, `storage` for state variables.

---

**Q13. What does `view` mean in a Solidity function?**

It means the function only reads data and never changes any state. Because nothing is written to the blockchain, calling a `view` function costs zero gas. It is a safety guarantee — Solidity will throw a compile error if you try to write anything inside a `view` function.

---

**Q14. What is the difference between `external` and `internal` in Solidity?**

`external` means the function can only be called from outside the contract — from the frontend, backend, or MetaMask. `internal` means the function can only be called from inside the contract itself. `_validCandidate()` is internal because it is a helper used only by `castVote()`. `getResults()` is external because the frontend needs to call it.

---

**Q15. What is a Merkle tree and why is it used in this project?**

A Merkle tree is a tree data structure where every leaf is a hash of data, and every parent node is a hash of its two children. The root of the tree is a single 32-byte value that represents the entire dataset. In this project it is used so the smart contract can verify voter eligibility without storing thousands of voter IDs on the blockchain — only the root (32 bytes) is stored. A voter proves eligibility by submitting a Merkle proof — the minimum set of hashes needed to reconstruct the root.

---

### Middleware & Decorators

**Q16. What is middleware and why is it used?**

Middleware is a security check that runs before the actual API function. It acts like a bouncer at a door — it checks if the request is valid and either rejects it or lets it through. In this project middleware checks if the JWT token is present and valid before any protected endpoint runs.

---

**Q17. What is a decorator in Python and how is it used in this project?**

A decorator is a function that wraps around another function and adds extra behaviour before or after it runs. In this project `@require_jwt` and `@require_admin` are decorators. When placed above an API function they run the token verification check first. If the check fails the actual function never runs. This avoids copy pasting the security check into every API function.

---

**Q18. What is the difference between 401 and 403 status codes?**

401 means Unauthorized — the request has no valid token, the user is not logged in at all. 403 means Forbidden — the user is logged in but does not have permission to access that resource. In this project `require_jwt` returns 401 when the token is missing or invalid. `require_admin` returns 403 when the token is valid but the role is not admin.

---

**Q19. What is Flask's `g` object?**

`g` is Flask's request-level storage — a temporary bag that exists for the duration of exactly one HTTP request and then disappears. In this project the middleware stores `g.user_id` and `g.role` after verifying the token so the actual API function can access them without decoding the token again.

---

**Q20. What does `*args` and `**kwargs` mean and why are they used in the decorator?**

`*args` accepts any number of positional arguments. `**kwargs` accepts any number of keyword arguments. They are used in the decorator's `decorated` function so it can wrap any API function regardless of what arguments that function takes. Without them the decorator would only work for functions with no arguments.

---

**Q21. What is `try/except` and why is it used in token verification?**

`try` attempts a block of code that might fail. `except` catches a specific error and handles it gracefully instead of crashing. In token verification, `jwt.decode()` throws a `JWTError` if the token is invalid or expired. Without `try/except` this would crash the entire server. With it the error is caught and a clean 401 response is returned instead.

---

**Q22. Where is the JWT token stored on the frontend and how does it reach the backend?**

After login the token is stored in the browser's `localStorage`. For every request after that the frontend reads it from `localStorage` and attaches it to the `Authorization` header in the format `Bearer TOKEN`. The backend reads this header on every protected request.

---

**Q23. What is `@wraps(f)` and why is it needed?**

`@wraps(f)` copies the original function's name onto the `decorated` wrapper function. Without it every wrapped function would be named `decorated` — Flask would throw an error saying duplicate endpoint name because it uses function names to build its routing system. `@wraps(f)` ensures each function keeps its original name after being wrapped.

---

**Q24. Why is `_extract_payload()` a separate private function?**

Because both `require_jwt` and `require_admin` need to do the exact same thing — read the Authorization header, strip the Bearer prefix, and decode the JWT. Instead of writing that logic twice, it is written once in `_extract_payload()` and called by both decorators. The underscore prefix signals it is an internal helper not meant to be called from outside the file.

---

**Q25. What does `return payload, None` mean and why return two values?**

Python allows returning multiple values at once as a tuple. `_extract_payload()` always returns two things — the payload and an error. On success it returns `(payload, None)` meaning here is the data and there is no error. On failure it returns `(None, error_response)` meaning there is no data and here is the error. The caller checks the second value first — if it is `None` everything is fine, if not something went wrong.

---

## Elections API — Practical Tests

### Test F — Create an election via curl
Get an admin token first, then:
```bash
curl -X POST http://localhost:5001/api/elections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "title": "Test Election",
    "election_type": "single_seat",
    "visibility_type": "private",
    "start_time": "2026-08-01T10:00:00",
    "end_time": "2026-08-02T10:00:00"
  }'
```
Response will show `status: "draft"` and a default "General" constituency already created.

---

### Test G — Try to edit a non-draft election
Find any election that is `scheduled` or `active` and try to update it:
```bash
curl -X PUT http://localhost:5001/api/elections/ELECTION_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"title": "Changed Title"}'
```
Returns `400 Only draft elections can be edited` — proves the status guard works.

---

### Test H — Add a candidate to an election
```bash
curl -X POST http://localhost:5001/api/elections/ELECTION_ID/candidates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"candidate_name": "Test Candidate", "party_name": "Test Party"}'
```
Response shows `candidate_position: 1` auto-assigned. Add another — it will get position 2.

---

### Test I — Run the audit endpoint
```bash
curl http://localhost:5001/api/elections/ELECTION_ID/audit \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```
With `BLOCKCHAIN_ENABLED=false` — returns `on_chain_tally: null, match: null`.
With `BLOCKCHAIN_ENABLED=true` and Hardhat running — returns both tallies and `match: true/false`.

---

## Candidates API — Practical Tests

### Test J — Add candidates and verify auto position
```bash
# First candidate — position will be 1
curl -X POST http://localhost:5001/api/elections/ELECTION_ID/candidates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"candidate_name": "Candidate One", "party_name": "Party A"}'

# Second candidate — position will be 2
curl -X POST http://localhost:5001/api/elections/ELECTION_ID/candidates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"candidate_name": "Candidate Two", "party_name": "Party B"}'
```
Check `candidate_position` in both responses — proves auto-increment works.

---

### Test K — Add candidate with spaces in name
```bash
curl -X POST http://localhost:5001/api/elections/ELECTION_ID/candidates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"candidate_name": "   Spaced Name   ", "party_name": "Party C"}'
```
Response will show name stored as `"Spaced Name"` — proves `strip()` works.

---

### Test L — Try adding candidate without a name
```bash
curl -X POST http://localhost:5001/api/elections/ELECTION_ID/candidates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"party_name": "Party D"}'
```
Returns `400 candidate_name is required` — proves required field check works.

---

### Test M — Delete a candidate
Copy `candidate_id` from Test J response, then:
```bash
curl -X DELETE http://localhost:5001/api/elections/ELECTION_ID/candidates/CANDIDATE_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```
Returns `{"message": "Candidate removed"}`.

---

## Auth API — Practical Tests

### Test A — Prove role is hardcoded
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name": "Hacker", "email": "hacker2@test.com", "password": "test123", "role": "admin"}'
```
Response will show `"role": "voter"` even though you sent `"admin"`.

---

### Test B — Admin login with a voter account
```bash
curl -X POST http://localhost:5001/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email": "hacker2@test.com", "password": "test123"}'
```
Returns `401 Invalid credentials` — the admin login filters `role="admin"` so a voter account is invisible to it.

---

### Test C — Try to update role via profile endpoint
```bash
curl -X PUT http://localhost:5001/api/auth/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"role": "admin"}'
```
Response returns the profile with `"role": "voter"` unchanged — `role` is not in the `updatable` whitelist.

---

### Test D — Link an invalid wallet address
```bash
curl -X PUT http://localhost:5001/api/auth/wallet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"wallet_address": "notavalidaddress"}'
```
Returns `400 Invalid Ethereum wallet address` — the regex rejects anything not matching `0x` + 40 hex characters.

---

### Test E — Update full_name and verify it changes
Login, copy token, then:
```bash
curl -X PUT http://localhost:5001/api/auth/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"full_name": "Updated Name"}'
```
Response returns profile with new `full_name`. Proves the whitelist allows this field.

---

## Auth API — Interview Questions

**Q26. Why is `role="voter"` hardcoded in the register endpoint?**

Because if the role was accepted from the request body, anyone could send `{"role": "admin"}` and immediately get admin access. The public register API should only ever create voter accounts. Admin accounts are created by directly inserting them into the database, not through a public API.

---

**Q27. How are admin accounts created if the register endpoint always makes voters?**

They are seeded directly into the database — either through a manual SQL insert, a seed script, or an internal admin-only endpoint that is never exposed publicly. This is intentional: admin creation should never be a self-service action.

---

**Q28. What is field whitelisting and why is it important in the profile update endpoint?**

A whitelist is an explicit list of fields that are allowed to be changed. In `update_profile`, only `full_name`, `phone_number`, `student_id`, `employee_id`, `address_line`, `city`, `state`, and `pincode` are in the list. Fields like `role`, `email`, `password_hash`, and `wallet_address` are excluded. Even if the frontend sends those fields, they are silently ignored. Without a whitelist, a malicious user could escalate their own role or overwrite their password hash.

---

**Q29. What does `setattr(user, field, value)` do and why use it?**

`setattr` dynamically sets an attribute on an object at runtime. `setattr(user, "city", "Bangalore")` is identical to writing `user.city = "Bangalore"`. It is used inside a loop so the same line of code can update any field from the whitelist without writing one `if` block per field.

---

**Q30. Why is `wallet_address` null by default and how does it get set?**

Because not every voter has a MetaMask wallet at the time of registration. `wallet_address` starts as `null` for every new user. The voter sets it later by calling `PUT /api/auth/wallet` with their MetaMask address. The backend validates the format with a regex before saving it.

---

## Elections & Candidates API — Interview Questions

**Q31. What is a URL parameter and how does Flask use it?**

A URL parameter is a variable embedded in the URL itself. In `/api/elections/<election_id>`, Flask extracts whatever value is in that position and passes it as an argument to the function. So calling `GET /api/elections/abc-123` gives the function `election_id = "abc-123"` automatically.

---

**Q32. Why does every write operation in elections.py check `status == "draft"` first?**

Because once an election is locked and deployed to the blockchain, it must not change. If an admin could edit candidates or times after voters have already verified or voted, it would break trust in the entire election. The draft check enforces that all setup must happen before locking.

---

**Q33. What is `db.session.flush()` and why is it needed when creating an election?**

`flush()` sends the INSERT statement to the database without committing the transaction. This makes the new `election_id` available immediately. It is needed because the default constituency must be created in the same request and needs the `election_id` as its foreign key — without flush, that ID does not exist yet.

---

**Q34. What is a partial update pattern and how is it implemented here?**

A partial update means only the fields the client sends are changed — everything else stays the same. It is implemented using `if "field" in data` checks so only present fields are updated. This is better than requiring the client to send the full object every time.

---

**Q35. What is an ABI and why does the backend need it to talk to a smart contract?**

ABI stands for Application Binary Interface. It is a JSON file that describes every function in the smart contract — names, input types, output types. Without it Python has no idea what functions the contract has or how to call them. It is generated by Hardhat when the Solidity contract is compiled and stored in `EVoting.json`.

---

**Q36. What is the difference between a `.call()` and a transaction in Web3?**

A transaction writes data to the blockchain — it costs gas, gets recorded permanently, and changes state. A `.call()` only reads data — it costs nothing, creates no record, and changes nothing. `castVote()` is a transaction. `getResults()` is a call.

---

**Q37. What does the audit endpoint prove and why is it important?**

It compares the vote tally from the database with the tally from the smart contract. If they match, the database was not tampered with. If they don't match, someone edited the database records. This is the entire reason votes are stored on the blockchain — you can always verify the database against an immutable source.

---

**Q38. What is a feature flag and why is `BLOCKCHAIN_ENABLED` used as one?**

A feature flag is a configuration switch that turns a feature on or off without changing code. `BLOCKCHAIN_ENABLED=false` in `.env` tells the backend to skip all blockchain calls. This is useful in development when you don't want to start Hardhat just to test login or elections. You flip the switch in the config file instead of commenting out code.

---

**Q39. Why is `candidate_position` auto-assigned and what is it used for?**

`candidate_position` is the on-chain ID for the candidate. When the contract is deployed, candidates are registered by these integers. When a voter casts a vote, they send this integer to the contract. Auto-assigning it (max + 1) ensures no two candidates in the same constituency get the same number.

---

**Q40. What security check prevents an admin from deleting a candidate from another election?**

After fetching the candidate by ID, the code checks `candidate.constituency.election_id != election_id`. If the candidate belongs to a different election, a 404 is returned. Without this check, knowing any candidate's UUID would be enough to delete them from any election.

---

## Candidates API — Interview Questions

**Q41. What does `request.get_json(silent=True) or {}` do and why is it used on every route?**

`get_json()` reads and parses the JSON body of the request. `silent=True` means if the body is missing or not valid JSON, return `None` instead of crashing. `or {}` converts that `None` into an empty dictionary so every `data.get(...)` call below it is safe. Without this pattern, sending a request with no body would crash the server.

---

**Q42. What does `strip()` do and why is it called on every input field?**

`strip()` removes whitespace from the beginning and end of a string. It is called on every field before saving to the database because users sometimes accidentally type leading or trailing spaces. Storing `"  Rahul  "` and `"Rahul"` as different values would cause bugs when comparing or displaying names.

---

**Q43. What is the difference between storing `NULL` and `""` in a database and why does it matter?**

`NULL` means the field has no value at all. `""` means the field has a value — it is just an empty string. They look the same visually but are different in the database. If some rows store `NULL` and others store `""` for the same field, queries using `IS NULL` will miss the `""` rows and vice versa. The `or None` at the end of optional field assignments ensures all empty values are stored as `NULL` consistently.

---

**Q44. Why does `candidate_name` not use `or None` at the end but `symbol_url` does?**

Because `candidate_name` is a required field — if it is empty, the next line catches it and returns a 400 error. There is no point converting it to `None` because an empty name is always rejected. `symbol_url` is optional — it is allowed to be empty, and when it is, we want to store `NULL` in the database rather than an empty string.

---

**Q45. Why does the smart contract need `candidate_position` instead of using the candidate's name?**

Smart contracts only understand fixed-size data types like integers — they cannot store or compare arbitrary strings efficiently. `candidate_position` is an integer (1, 2, 3...) that serves as the on-chain ID. When a voter calls `castVote(2)`, the contract records a vote for position 2. The database links position 2 to the name "Rahul Gandhi". The frontend combines both to display results with names.

---

## Hardhat — Redeploy All Elections After Node Restart

Every time the Hardhat node restarts, all deployed contracts are wiped.
The database still holds old contract addresses pointing to nothing.
You need to redeploy every election to get fresh contracts on the running node.

---

### Why this happens

```
Hardhat node restarts
        │
        ├── All deployed contracts → GONE
        ├── All transaction history → GONE
        └── Account balances reset to 10,000 ETH

MySQL database → STILL HAS old contract addresses → now pointing to nothing
```

---

### Option 1 — Redeploy one by one

```bash
curl -X POST http://localhost:5001/api/elections/ELECTION_ID/redeploy \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Option 2 — Redeploy all at once using a loop

First get a fresh admin token:

```bash
curl -X POST http://localhost:5001/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email": "abc@gmail.com", "password": "123456"}'
```

Then run this single command — it redeploys all elections automatically:

```bash
TOKEN="PASTE_YOUR_TOKEN_HERE"

for ID in \
  "9966c1a3-f88c-4d14-a3b8-738bfc7a53f8" \
  "a89eff3c-91b3-414e-b5f4-7f4c3d5f9dfd" \
  "bfe8dec9-1427-46e2-b6d9-0966f8bc37f8" \
  "cbc09ab5-c081-48b4-87de-d63623b233ce" \
  "f280fc70-3a25-4597-a8f3-fcb57ccad529" \
  "fd027b60-691e-4918-80d9-8fcd99f66ed7"
do
  echo "Redeploying $ID..."
  curl -s -X POST http://localhost:5001/api/elections/$ID/redeploy \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
done
```

---

### What to do every time you start fresh

```
Step 1 — Start Hardhat node
         cd contracts && npx hardhat node

Step 2 — Start Flask backend
         cd backend && python run.py

Step 3 — Get admin token
         curl -X POST http://localhost:5001/api/auth/admin/login ...

Step 4 — Run the redeploy loop above with your token

Step 5 — All elections now have fresh contracts on the running node
```

---

### Why one platform wallet deploys all contracts

The backend uses one private key stored in `.env`:
```
PLATFORM_PRIVATE_KEY=0xac0974bec39...
```
This is Hardhat Account #0. Every election contract is deployed by this wallet.
Each election still gets its own independent contract at its own unique address —
the deployer wallet is just the sender, not the contract itself.

---

## Voters API — Practical Tests

### Test N — Upload a CSV of voters
```bash
# Create a small test CSV
echo "voter_id
STU001
STU002
STU003" > /tmp/test_voters.csv

# Upload it (use a draft + private election)
curl -s -X POST http://localhost:5001/api/elections/ELECTION_ID/voters/upload \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@/tmp/test_voters.csv"
```
Expected response: `{"status": "finished", "result": {"count": 3, "election_id": "..."}}`

---

### Test O — Clear all voters
```bash
curl -s -X DELETE http://localhost:5001/api/elections/ELECTION_ID/voters \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```
Expected: `{"message": "Cleared 3 voter records"}` — proves `.delete()` returns the count.

---

### Test P — Try uploading to a public election (should fail)
Find any election where `visibility_type: "public"` and try to upload:
```bash
curl -s -X POST http://localhost:5001/api/elections/PUBLIC_ELECTION_ID/voters/upload \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@/tmp/test_voters.csv"
```
Expected: `{"message": "CSV upload is only for private elections"}` — proves the guard check works.

---

## Voters API — Interview Questions

**Q46. What is `request.files` and how is it different from `request.get_json()`?**

`request.files` reads files attached to a multipart form upload — the kind sent when a browser or curl uploads a file using `-F`. `request.get_json()` reads a JSON body sent with `Content-Type: application/json`. They are different formats. File uploads cannot be read with `get_json()` and JSON bodies cannot be read with `request.files`.

---

**Q47. Why is the CSV job import inside the function instead of at the top of the file?**

To avoid circular import errors. `csv_jobs` imports things that eventually import things that would loop back to `voters.py`. Placing the import inside the function delays it until the function is actually called, by which time all modules are fully loaded and the circular dependency is broken.

---

**Q48. What does `.delete()` return and why is the return value used here?**

`.delete()` on a SQLAlchemy query deletes all matching rows and returns the number of rows deleted. The return value is stored in `deleted` and then included in the response message (`f"Cleared {deleted} voter records"`). This tells the admin exactly how many rows were removed without needing a separate count query.

---

**Q49. What is an f-string in Python?**

An f-string (formatted string literal) lets you embed variable values directly inside a string using `{}`. Writing `f"Cleared {deleted} voter records"` automatically replaces `{deleted}` with the actual value of the variable at runtime. It is cleaner than string concatenation.

---

**Q50. Why does the CSV upload run the job directly instead of queuing it in RQ?**

Because RQ (Redis Queue) crashes on macOS with signal 6 (SIGABRT). The comment in the code explicitly explains this. For local development the job runs inline — `process_csv_upload(...)` is called directly and the result is returned in the same HTTP response. In production with a Linux server, this would be queued as a background job instead.

---

## Votes API — Practical Tests

### Test Q — Send missing fields (should fail)
```bash
curl -s -X POST http://localhost:5001/api/votes/confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"election_id": "abc"}' | python3 -m json.tool
```
Expected: `400 election_id, tx_hash, candidate_id, and wallet_address are required`

---

### Test R — Send invalid tx_hash format (should fail)
```bash
curl -s -X POST http://localhost:5001/api/votes/confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "election_id": "9b4f1b76-71fe-4168-95b6-e162fa5953f8",
    "tx_hash": "notahash",
    "candidate_id": "1",
    "wallet_address": "0xabc"
  }' | python3 -m json.tool
```
Expected: `400 Invalid tx_hash format`

---

## Votes API — Interview Questions

**Q51. Why does the backend save the tx_hash if the vote is already on the blockchain?**

Because the blockchain is not convenient to query for every page load. Saving the tx_hash in MySQL gives the frontend a fast way to show the voter their receipt, build the audit log, and count total votes without calling the blockchain every time. The blockchain remains the source of truth — the database is just a fast cache for display.

---

**Q52. What is idempotency and why does the confirm endpoint need it?**

Idempotent means calling the same operation multiple times produces the same result as calling it once. The confirm endpoint needs it because networks are unreliable — the frontend might timeout and retry the same request. Without idempotency, the same tx_hash could be saved twice, corrupting the audit log. The check `if existing tx_hash: return success` makes the endpoint safe to call multiple times.

---

**Q53. What does `not all([...])` do and why use it instead of separate checks?**

`all([...])` returns `True` only if every item in the list is truthy. `not all(...)` means "if any one item is empty or missing, return True." It validates all four required fields in a single line instead of writing four separate `if not field` blocks. Cleaner and less repetitive.

---

**Q54. Why must `tx_hash` be exactly 66 characters?**

An Ethereum transaction hash is always `0x` (2 characters) followed by 64 hexadecimal characters = 66 total. This is a fixed format defined by the Ethereum protocol. Any string shorter or longer is not a valid transaction hash and must be rejected before trying to use it.

---

**Q55. Why is `db.session.add()` needed but not always used?**

`add()` is only needed for new objects that SQLAlchemy has never seen before. When you create `vt = VoteTransaction(...)`, that object only exists in Python memory — SQLAlchemy does not track it automatically. `add()` registers it. But when you fetch an object from the database like `user = User.query.get(id)`, SQLAlchemy already tracks it — so you can change a field and commit without calling `add()` again.

---

## Frontend — Interview Questions

**Q56. What is React Context and why is it used in this project?**

React Context is a way to share data across all components without passing it manually through every level. In this project, `AuthContext` holds the logged-in user, token, login function, and logout function. Any page can access these by calling `useAuth()` instead of having user data passed down from parent to child to grandchild.

---

**Q57. What is `useState` and why is it different from a normal variable?**

`useState` is React's special variable that remembers its value across re-renders and automatically updates the screen when it changes. A normal JavaScript variable is reset every time React re-renders the component. `useState(null)` means start with `null` and whenever `setUser()` is called with a new value, React redraws any part of the screen that uses it.

---

**Q58. Why does AuthContext read from localStorage on startup?**

So the user stays logged in after refreshing the page. When the user logs in, their token and user data are saved to localStorage. When the page reloads, `useState(() => localStorage.getItem('user'))` runs once and restores the session. Without this, every page refresh would log the user out.

---

**Q59. What is an axios interceptor and why is it used in client.js?**

An interceptor is a function that runs automatically before every HTTP request axios makes. In `client.js`, the interceptor reads the JWT token from localStorage and attaches it to the `Authorization` header of every request. Without it, every single API call in every page would need to manually add the token. The interceptor writes this logic once and it applies everywhere.

---

**Q60. What is the difference between curl and axios?**

Both make HTTP requests to a server. curl runs in the terminal and is triggered manually by a developer — used for testing and debugging. axios runs in the browser inside JavaScript code and is triggered automatically by user actions like clicking a button. Both send requests to the same Flask backend and receive the same JSON responses. The difference is the environment and who triggers the request.

---

## castVote.js — Interview Questions

**Q61. What is `window.ethereum` and why does the frontend use it?**

`window.ethereum` is MetaMask's JavaScript API injected into the browser when MetaMask is installed. It allows JavaScript code to send transactions, request wallet connections, and communicate with the blockchain through MetaMask. Without it there is no way for a webpage to interact with a user's wallet.

---

**Q62. Why does the frontend encode the function call before sending the transaction?**

The blockchain does not understand function names or JavaScript objects — it only understands raw bytes. `encodeFunctionData('castVote', [candidatePosition, merkleProof])` converts the function call into a hex string that the Ethereum Virtual Machine can parse and execute. This encoding follows the ABI specification so the contract knows which function to run and what arguments were passed.

---

**Q63. What is RPC backoff and why does castVote.js handle it?**

RPC stands for Remote Procedure Call — how JavaScript sends commands to the blockchain node. Backoff means the node is overloaded and telling the caller to slow down. On Hardhat locally, MetaMask constantly pings the node in the background for balance and gas updates, which can overwhelm it when a real transaction arrives at the same time. Error `-32002` is Hardhat's signal for this. The retry logic waits 32 seconds and tries again up to 3 times. This only happens on Hardhat — real networks have enough capacity that this never occurs.

---

**Q64. Why does the retry loop wait exactly 32 seconds?**

MetaMask's internal backoff timer resets after approximately 30 seconds — after which it slows down its background polling. Waiting 32 seconds gives MetaMask time to calm down before the next transaction attempt. The countdown is shown to the user via `onStatusChange` so the button doesn't appear frozen.

---

**Q65. What happens after 3 failed transaction attempts?**

The `throw err` at the bottom of `sendTransaction()` re-throws the error to the `castVote()` caller, which is the Vote page in React. The Vote page catches it and shows the user an error message. Nothing is saved — no blockchain record, no MySQL record. The voter can try clicking Vote again from scratch.

---

## How to Use This Document

- **Before an interview:** Read all 15 questions and answer each one out loud
- **During study:** Do each practical test in order — do not skip
- **When stuck:** Go back to the relevant section in `database-guide.md` or ask for help
- **Track progress:** Check off each test as you complete it

---

## Tests Checklist

```
[ ] Test 1  — Add column with default value + migration cycle
[ ] Test 2  — Query database using Flask shell
[ ] Test 3  — Inspect database directly in MySQL
[ ] Test 4  — Navigate relationships in Flask shell
[ ] Test 5  — Break and fix cascade (already done ✓)
[ ] Test 6  — Decode a JWT token at jwt.io
[ ] Test 7  — Hit every API endpoint using curl or Postman
[ ] Test 8  — Git branch, change, merge cycle
[ ] Test 9  — Read contract state from Hardhat console
[ ] Test 10 — Read git history and understand what changed
[ ] Test N  — Upload a CSV of voters to a private election ✓
[ ] Test O  — Clear all voters and verify count ✓
[ ] Test P  — Try uploading to a public election (should fail)
```
