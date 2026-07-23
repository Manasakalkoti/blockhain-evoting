# Database Guide — Blockchain E-Voting System

Written for a student learning this project from scratch.
No prior database knowledge assumed.

---

## Roadmap — How to Understand This Project Top to Bottom

Follow this order. Do not skip steps.

```
STEP 1 — Understand the Problem
         Why does this app exist? What is it solving?

STEP 2 — Understand the Architecture
         What are the 3 systems? (Frontend, Backend, Blockchain)
         How do they talk to each other?

STEP 3 — Understand the Database  ← YOU ARE HERE
         What data is stored? How are tables related?
         This is the backbone of the entire backend.

STEP 4 — Understand the Smart Contract
         What does EVoting.sol do?
         What does it store on the blockchain?

STEP 5 — Understand the Backend APIs
         What URLs exist? What does each one do?
         How does a request come in and get processed?

STEP 6 — Understand the Frontend
         How does the user interact with the app?
         Which API does each page call?

STEP 7 — Understand the Full Vote Flow
         Trace a single vote from start to finish
         across all 3 systems.
```

**Rule:** Always understand the WHAT and WHY before the HOW.
Before reading any function, ask — "Why does this need to exist?"

---

## What is a Database in This Project?

The database is a MySQL database that stores everything the app needs to function:
- Who the users are
- What elections exist
- Who is eligible to vote
- Whether a voter has been verified
- The transaction hash of every vote cast on the blockchain

Think of it as the app's memory. Every page you see, every action you take,
reads from or writes to this database.

---

## The 8 Tables — What Each One Stores

```
organizations        — colleges or institutions that use this platform
users                — everyone: admins and voters
elections            — every election created by an admin
constituencies       — divisions within an election (e.g. "CSE Department")
candidates           — people standing for election, belong to a constituency
election_voters      — the uploaded CSV list of eligible voter IDs
voter_verifications  — records whether a voter is eligible for an election
vote_transactions    — every vote cast, with its blockchain transaction hash
```

---

## The Full Relationship Map

```
Organization
    │
    └── User (admin or voter)
            │
            ├── [as admin] creates ──▶ Election
            │                              │
            │                              └── Constituency
            │                                      │
            │                                      ├── Candidate
            │                                      └── ElectionVoter (CSV list)
            │
            ├── [as voter] gets verified ──▶ VoterVerification
            │                                   links User ↔ Election
            │
            └── [as voter] casts vote ──▶ VoteTransaction
                                            links User ↔ Election
                                            stores blockchain tx hash
```

---

## Table 1 — organizations

```python
organization_id   # unique ID (UUID)
name              # e.g. "RV College of Engineering"
type              # e.g. "college", "university"
created_at        # when it was created
```

**Plain English:** A college or institution registers on the platform.
All users (admins and voters) belong to an organization.

**Key relationship:**
```python
users = db.relationship("User", back_populates="organization", lazy="dynamic")
```
One organization has many users. `lazy="dynamic"` means users are not
loaded from DB until you explicitly ask for them.

---

## Table 2 — users

```python
user_id           # unique ID (UUID) — primary key
full_name
email             # unique — no two accounts with same email
password_hash     # bcrypt hashed password — never stored as plain text
phone_number
aadhaar_hash      # hashed Aadhaar ID (never stored raw)
firebase_uid      # reserved for Firebase OTP (not used currently)
role              # ENUM: "admin" or "voter" — determines what they can do
wallet_address    # MetaMask Ethereum address — linked by voter themselves
organization_id   # FK → organizations — which college they belong to
student_id        # used to verify eligibility in private elections
employee_id
address_line      # used for geo-verification in public elections
city
state
pincode
latitude
longitude
status            # ENUM: "active" or "suspended"
created_at
```

**Plain English:** Every person who uses the app has a row here.
The `role` column determines whether they see the admin dashboard or the voter dashboard.
The `wallet_address` is linked after the voter connects MetaMask.
The `student_id` is what the voter submits during eligibility verification.

**KEY POINT — password_hash:**
The password is never stored as plain text. It is run through bcrypt
(a one-way hashing algorithm) before being stored. Even if someone steals
the database, they cannot reverse the hash to get the real password.

**KEY POINT — wallet_address:**
This is the voter's Ethereum wallet address. It starts with `0x` and is
42 characters long. Every vote is signed from this wallet — the backend
cannot forge it.

**Relationships:**
```python
organization      = db.relationship("Organization", back_populates="users")
created_elections = db.relationship("Election", back_populates="created_by", lazy="dynamic")
voter_verifications = db.relationship("VoterVerification", back_populates="user", lazy="dynamic")
vote_transactions = db.relationship("VoteTransaction", back_populates="voter", lazy="dynamic")
```

---

## Table 3 — elections

```python
election_id               # unique ID (UUID) — primary key
title                     # e.g. "Student Council Election 2026"
description
election_type             # ENUM: "single_seat" or "multi_seat"
visibility_type           # ENUM: "private" or "public"
start_time                # when voting opens
end_time                  # when voting closes
eligibility_merkle_root   # cryptographic fingerprint of voter list (bytes32 hex)
location_rule_hash        # hash of geo rules for public elections
location_rules            # JSON: {districts, wards, pincodes} for public elections
eligibility_locked        # True once voter list is finalized — cannot change after
candidates_locked         # True once candidates are finalized — cannot change after
candidate_list_hash       # tamper-proof fingerprint of candidate list
merkle_tree_json          # full Merkle tree stored here for on-demand proof generation
contract_address          # 0x... address of deployed smart contract on Ethereum
contract_deployed_at      # when the contract was deployed
created_by_admin          # FK → users — which admin created this
status                    # ENUM: "draft" → "scheduled" → "active" → "completed"
results_published         # True when results are visible to voters
created_at
```

**Plain English:** Every election created by an admin has a row here.
The `status` column controls the entire lifecycle of an election.
Once the admin locks the election, a smart contract is deployed to Ethereum
and its address is stored in `contract_address`. All votes go to that address.

**KEY POINT — status lifecycle:**
```
draft       → admin is setting up (adding candidates, uploading voters)
scheduled   → locked and deployed, waiting for start_time
active      → voting is open right now
completed   → voting has ended, results are published
```
This transition is automatic — the app checks the current time and moves
the status forward when `start_time` or `end_time` is reached.

**KEY POINT — two election types:**
```
private   → only people on the uploaded CSV list can vote
            eligibility checked by student ID
public    → anyone in the right geographic area can vote
            eligibility checked by city/pincode
```

**KEY POINT — contract_address:**
This is the most important field in this table. Once set, it links the
election record in MySQL to the actual smart contract on the Ethereum blockchain.
The frontend uses this address to send votes directly to the blockchain.

**Relationships:**
```python
created_by      = db.relationship("User", back_populates="created_elections")
constituencies  = db.relationship("Constituency", back_populates="election",
                    lazy="dynamic", cascade="all, delete-orphan")
voter_verifications = db.relationship("VoterVerification", ...)
vote_transactions   = db.relationship("VoteTransaction", ...)
```

`cascade="all, delete-orphan"` — if you delete an election, all its
constituencies (and their candidates and voter lists) are deleted automatically.

---

## Table 4 — constituencies

```python
constituency_id     # unique ID (UUID) — primary key
election_id         # FK → elections
constituency_name   # e.g. "CSE Department", "General", "Ward 24"
description
created_at
```

**Plain English:** A constituency is a division within an election.
Every election gets at least one constituency created automatically (called "General").
Multi-constituency elections (e.g. department-wise elections) would have multiple rows here.

Candidates and voter lists belong to a constituency, not directly to an election.
This is what allows multi-constituency elections to work.

**Relationships:**
```python
election        = db.relationship("Election", back_populates="constituencies")
candidates      = db.relationship("Candidate", back_populates="constituency",
                    lazy="dynamic", cascade="all, delete-orphan")
election_voters = db.relationship("ElectionVoter", back_populates="constituency",
                    lazy="dynamic", cascade="all, delete-orphan")
```

---

## Table 5 — candidates

```python
candidate_id          # unique ID (UUID) — primary key
constituency_id       # FK → constituencies — which constituency they're in
candidate_name        # full name
candidate_identifier  # USN or Employee ID — for validation
party_name
symbol_url            # text symbol like "🌹" or "Hand"
profile_photo
manifesto
candidate_position    # integer — used as the on-chain candidate ID in the contract
status                # ENUM: "active", "withdrawn", "disqualified"
created_at
```

**Plain English:** Every person standing for election has a row here.
They belong to a constituency (not directly to an election).

**KEY POINT — candidate_position:**
This is the most critical field here. When the smart contract is deployed,
candidates are registered by their `candidate_position` integer (1, 2, 3...).
When a voter casts a vote, they send this integer to the contract.
The contract tallies votes by this integer. This is how MySQL candidates
are linked to on-chain vote counts.

---

## Table 6 — election_voters

```python
id                    # unique ID (UUID) — primary key
constituency_id       # FK → constituencies
voter_identifier      # raw ID from CSV — e.g. "1RV21CS001" (student roll number)
hashed_identifier     # keccak256 hash of the voter_identifier
authorization_status  # always "authorized" — every row here is an eligible voter
created_at
```

**Plain English:** When an admin uploads a CSV of eligible voters, every row
in that CSV becomes a row in this table. The `voter_identifier` is the raw
student ID from the CSV. During pre-verification, the voter types their
student ID and the backend checks if it exists here.

**KEY POINT — hashed_identifier:**
The voter_identifier is also stored as a keccak256 hash. This was originally
intended for Merkle tree leaf generation. Even though the Merkle proof system
uses a zero root currently, the hash is stored for future use.

---

## Table 7 — voter_verifications

```python
id            # unique ID (UUID) — primary key
user_id       # FK → users — which voter
election_id   # FK → elections — which election
method        # ENUM: "id_verification" (private) or "address_verification" (public)
verified      # Boolean — True if eligible, False if not
verified_at   # timestamp when they were verified
created_at
```

**Plain English:** This table is the gatekeeper. Before a voter can cast a vote,
they must have a row here with `verified = True` for that election.

The backend checks this table before allowing a vote to be recorded.
This is the bridge between "voter submitted their student ID" and "voter is
allowed to cast a vote in this election."

**KEY POINT:**
One voter can be verified for many elections — each gets its own row.
If `verified = False`, the voter tried to verify but was not on the eligible list.
If `verified = True`, the voter is cleared to vote.

**Relationships:**
```python
user     = db.relationship("User", back_populates="voter_verifications")
election = db.relationship("Election", back_populates="voter_verifications")
```

---

## Table 8 — vote_transactions

```python
transaction_id      # unique ID (UUID) — primary key
election_id         # FK → elections
voter_id            # FK → users
wallet_address      # the MetaMask address that signed the transaction
candidate_id        # which candidate was voted for (candidate_position integer)
blockchain_tx_hash  # 0x... the Ethereum transaction hash — UNIQUE
timestamp           # when the vote was recorded
```

**Plain English:** Every confirmed vote has a row here. This is the audit log.
After a voter casts a vote through MetaMask, the frontend sends the transaction
hash to the backend. The backend records it here.

**KEY POINT — blockchain_tx_hash:**
This is marked `unique=True`. No two rows can have the same transaction hash.
This prevents the same vote from being recorded twice (idempotency).

**KEY POINT — candidate_id is not a FK:**
Notice `candidate_id` has no `db.ForeignKey(...)`. The comment in the code says:
"not FK — contract is source of truth." The blockchain contract is the
authoritative record of who voted for whom. The database just stores the
hash as proof that it happened.

**Relationships:**
```python
election = db.relationship("Election", back_populates="vote_transactions")
voter    = db.relationship("User", back_populates="vote_transactions")
```

---

## The 4 Key Relationship Concepts Used in This Project

### 1. Foreign Key (`db.ForeignKey`)
A real column in the database that stores another table's ID.
Creates a hard link — the database will reject invalid values.
```python
election_id = db.Column(db.String(36), db.ForeignKey("elections.election_id"))
```

### 2. Relationship (`db.relationship`)
Not a column — a Python shortcut to navigate between objects.
Tells SQLAlchemy how to join tables when you access a related object.
```python
election = db.relationship("Election", back_populates="voter_verifications")
```

### 3. back_populates
Connects both sides of a relationship so they stay in sync.
Each side names the attribute on the other model that it pairs with.
```python
# In VoterVerification:
election = db.relationship("Election", back_populates="voter_verifications")
# In Election:
voter_verifications = db.relationship("VoterVerification", back_populates="election")
```

### 4. cascade="all, delete-orphan"
When a parent is deleted, automatically delete all its children.
Used wherever children cannot exist without their parent.
```python
# Deleting an Election automatically deletes its Constituencies
# Deleting a Constituency automatically deletes its Candidates and ElectionVoters
constituencies = db.relationship("Constituency", cascade="all, delete-orphan")
```

---

## How a Vote Travels Through the Database

```
1. Admin creates Election row (status = "draft")
2. Admin adds Candidate rows (linked to Constituency)
3. Admin uploads CSV → ElectionVoter rows created
4. Admin locks election → contract deployed → contract_address saved in Election row
5. Election status transitions: draft → scheduled → active (automatic, time-based)

6. Voter registers → User row created
7. Voter submits student ID → checked against ElectionVoter table
8. If found → VoterVerification row created (verified = True)

9. Voter connects MetaMask → wallet_address saved in User row
10. Voter selects candidate → MetaMask signs transaction → sent to blockchain
11. Blockchain records vote permanently (cannot be altered)
12. Frontend gets transaction hash from MetaMask
13. Frontend sends hash to backend → VoteTransaction row created

14. Election end_time passes → status = "completed", results_published = True
15. Results page reads VoteTransaction rows + calls blockchain getResults()
```

---

## Key Points to Remember

- **The database stores everything EXCEPT votes.** Votes live on the blockchain.
  The database only stores the transaction hash as proof.

- **`status` in elections is the most important field** to understand.
  Every API checks it before doing anything.

- **`contract_address` is the bridge** between MySQL and the blockchain.
  Without it, the frontend cannot send votes anywhere.

- **`verified = True` in voter_verifications is the gatekeeper.**
  No verification = no vote allowed.

- **`candidate_position` is the on-chain ID.**
  It connects a MySQL candidate to their vote count in the smart contract.

- **Passwords and Aadhaar are never stored raw.**
  Always hashed with bcrypt before storing.

- **`blockchain_tx_hash` is unique.**
  The same vote cannot be recorded twice.
