# Lock & Deploy — Complete Study Notes

Everything that happens when an admin clicks "Lock & Deploy" on an election.

---

## 1. Big Picture

```
Admin clicks "Lock & Deploy"
        ↓
Flask reads election settings from MySQL
        ↓
Flask builds the contract (bytecode + constructor args)
        ↓
Flask signs the deployment transaction with PLATFORM_PRIVATE_KEY
        ↓
Flask sends it to Hardhat via RPC (HTTP)
        ↓
Hardhat mines a new block, contract now lives on chain
        ↓
Flask polls Hardhat via RPC: "is it mined yet?"
        ↓
Hardhat replies with the receipt (includes contract address)
        ↓
Flask saves the contract address to MySQL
```

---

## 2. What is RPC?

**RPC = Remote Procedure Call**

It means: call a function that lives on another machine as if it were a local function.

Flask and Hardhat are two completely separate processes. They don't share memory. Flask is Python, Hardhat is Node.js. The only way they can talk is over the network.

RPC hides the network details. Instead of manually opening sockets and formatting packets, you just write:

```python
w3.eth.send_raw_transaction(signed.raw_transaction)
```

It looks like a normal Python function call. Under the hood, web3.py sends an HTTP POST to Hardhat.

### How the connection is set up

In `merkle_jobs.py`:

```python
w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
```

- `127.0.0.1` = localhost (same machine)
- `8545` = Hardhat's default port
- Every `w3.eth.*` call from this point sends an HTTP request to that address

There is no persistent open connection. Each RPC call is a fresh HTTP POST request.

### What an RPC call looks like on the wire

```
POST http://127.0.0.1:8545
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method":  "eth_sendRawTransaction",
  "params":  ["0xf901a38085174876e800833..."],
  "id":      1
}
```

The `method` field is the name of the function on the Hardhat side. This is the "remote procedure" being called.

```
Flask (port 5001)                    Hardhat (port 8545)
       │                                     │
       │  POST / {"method": "eth_send..."}   │
       │ ──────────────────────────────────► │
       │                                     │  executes, mines block
       │  {"result": "0x75cfa3b..."}         │
       │ ◄────────────────────────────────── │
```

---

## 3. What is Bytecode?

You write the contract in Solidity (human-readable):

```solidity
contract EVoting {
    mapping(uint => uint) public voteCounts;

    function castVote(uint candidateId, bytes32[] proof) public {
        // verify proof, record vote
    }
}
```

The Solidity compiler (`solc`) converts this into **EVM bytecode** — machine code for the Ethereum Virtual Machine:

```
608060405234801561001057600080fd5b506040516...
```

This is ones and zeros that the EVM can execute directly. Like how your `.py` file becomes machine code when Python runs it — except here the output is stored permanently on the blockchain.

The bytecode file lives in `contracts/artifacts/EVoting.json` on your machine. Flask loads it at deployment time.

---

## 4. What are Constructor Args?

A Solidity contract has a constructor — code that runs exactly once at the moment of deployment to set initial values:

```solidity
constructor(
    uint256[] memory _candidateIds,
    uint256 _startTime,
    uint256 _endTime,
    bytes32 _merkleRoot
) {
    candidateIds = _candidateIds;
    startTime    = _startTime;
    endTime      = _endTime;
    merkleRoot   = _merkleRoot;
}
```

Flask reads the election's settings from MySQL and encodes the actual values:

```python
encoded_args = abi_encode(
    ["uint256[]", "uint256", "uint256", "bytes32"],
    [[1, 2, 3], 1753228800, 1753257600, b'\x00'*32]
)
```

ABI encoding = packing these values into a standardised byte sequence so the EVM knows exactly where each value starts and ends.

The actual values travel inside the transaction — not a reference or pointer, the values themselves:

```
candidate IDs  →  [1, 2, 3]
start time     →  1753228800   (Unix timestamp)
end time       →  1753257600
merkle root    →  0x000...     (32 bytes)
```

---

## 5. What is deploy_data?

```python
deploy_data = bytecode + encoded_constructor_args
```

Bytecode and constructor args are concatenated into one blob:

```
[608060405234801561001057...EVM machine code...][000000000000003000...candidate IDs, times, root...]
```

This goes into the `data` field of the transaction.

When Hardhat receives this:
1. It sees the `to` field is empty → this is a deployment, not a function call
2. It runs the bytecode
3. The constructor reads the appended args and writes them into contract storage
4. The contract now lives at a new address with those values baked in permanently

### Concrete analogy

- Bytecode = the mould (shape of the contract)
- Constructor args = the concrete poured in (the actual values)
- Once it sets, both shape and values are locked forever
- The mould (your `.sol` file) still exists on your machine, ready to pour a new election

Every deployed election gets its own independent copy at its own address:

```
0xAAA...  ← NGO President Election   (candidates [1,2,3], merkle root A)
0xBBB...  ← Class Rep Election       (candidates [1,2],   merkle root B)
0xCCC...  ← Sports Captain Election  (candidates [1,2,3,4], merkle root C)
```

Same bytecode, three separate instances, each with their own state and storage.

---

## 6. Signing the Transaction

### What is being signed?

A deployment transaction — a special Ethereum transaction with:

```python
tx = {
    "from":     "0xPlatformWalletAddress",
    "to":       None,           # ← empty = "create a new contract"
    "data":     deploy_data,    # ← bytecode + constructor args
    "gas":      3_000_000,
    "gasPrice": w3.eth.gas_price,
    "nonce":    4,              # ← how many txs this wallet has sent before
    "chainId":  31337,          # ← Hardhat network ID
}
```

### What signing does

```python
signed = account.sign_transaction(tx)
```

This runs ECDSA (Elliptic Curve Digital Signature Algorithm) using the platform's private key:

```
signature = ECDSA_sign(hash(tx), PLATFORM_PRIVATE_KEY)
```

Produces three values `(v, r, s)` appended to the transaction bytes. This happens entirely in memory — no network call, just math.

Result: `signed.raw_transaction` = the full transaction + signature as a hex blob.

### Why must it be signed?

Signing does two things:

1. **Proves identity** — only someone who holds `PLATFORM_PRIVATE_KEY` could produce that signature
2. **Authorises gas payment** — deploying a contract costs ETH. The platform wallet is paying. The signature is the wallet saying "yes, deduct gas from my balance"

### Why the PLATFORM key and not the admin's key?

The admin only has an email/password login to Flask. They have no Ethereum wallet. The platform holds one Ethereum wallet (`PLATFORM_PRIVATE_KEY` in `.env`) and deploys contracts on behalf of all admins.

Think of it like: the admin fills out a form, and the platform's wallet actually pays for and submits the deployment.

---

## 7. How Ethereum Knows the Platform's Public Key

Ethereum does not need to know the public key in advance. It derives it from the signature.

The special property of ECDSA is:

```
given:  (transaction data) + (v, r, s signature)
you can COMPUTE the public key that produced this signature
```

This is called **signature recovery**. Hardhat does this on every incoming transaction:

```
recovered_public_key = ECDSA_recover(hash(tx_data), v, r, s)
sender_address       = keccak256(recovered_public_key)[-20 bytes]
```

Then checks: does that derived address match the `from` field in the transaction?

- YES → valid, sender is authenticated
- NO → rejected

### The full key chain

```
PLATFORM_PRIVATE_KEY   (kept secret in .env)
        ↓  [elliptic curve multiplication — one-way]
  public key           (mathematically derived, cannot reverse to get private key)
        ↓  [keccak256 hash, take last 20 bytes]
  wallet address       (0xPlatformWalletAddress)
```

The platform wallet never "registers" with Ethereum. The private key implies the public key (math), the public key implies the address (hash). Ethereum recomputes the chain from the signature on every transaction.

---

## 8. send_raw_transaction — The Deployment RPC Call

```python
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
```

### What web3.py sends to Hardhat

```json
{
  "jsonrpc": "2.0",
  "method":  "eth_sendRawTransaction",
  "params":  ["0xf901a38085174876e800833...{bytecode}...{args}...{signature}"],
  "id":      1
}
```

### What Hardhat does

1. Decodes the raw transaction bytes
2. Recovers the sender address from the signature
3. Checks the sender has enough ETH for gas
4. Puts the transaction in a pending pool
5. Immediately mines a new block (Hardhat mines instantly; real Ethereum takes ~12 seconds)
6. The contract now exists at a new address on the local chain

### What Hardhat replies

```json
{
  "jsonrpc": "2.0",
  "id":      1,
  "result":  "0x75cfa3b2e1d849f2c5a3a7b1..."
}
```

`result` is the **transaction hash** — a 32-byte fingerprint of this transaction. Like a tracking number.

`send_raw_transaction` returns immediately after submission. Flask does not yet know if the contract is deployed — it only knows the transaction was accepted.

---

## 9. wait_for_transaction_receipt — The Polling RPC Call

```python
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
```

Flask is asking: **"Has this transaction been mined into a block yet?"**

### What happens internally

```python
while True:
    result = eth_getTransactionReceipt(tx_hash)  # RPC call every iteration
    if result is not None: return result
    sleep(0.1)
```

Each iteration sends a fresh HTTP request to Hardhat:

```json
{
  "jsonrpc": "2.0",
  "method":  "eth_getTransactionReceipt",
  "params":  ["0x75cfa3b2e1d849f2c5a3a7b1..."],
  "id":      2
}
```

Not mined yet → Hardhat replies `null` → sleep 0.1s → try again.

Once mined → Hardhat replies with the full receipt.

### What the receipt contains

```python
{
    "transactionHash":  "0x75cfa3b...",
    "blockNumber":      5,            # which block it landed in
    "gasUsed":          1234567,      # how much gas was consumed
    "status":           1,            # 1 = success, 0 = failed/reverted
    "contractAddress":  "0xe7f172...", # ← what Flask actually wants
    "logs":             [...],        # events emitted during execution
}
```

The receipt is not the address — it is a full confirmation object. The contract address is one field inside it.

### Why Flask cannot know the address before mining

The contract address is computed during mining:

```
contract_address = keccak256(platform_wallet_address + nonce)[-20 bytes]
```

This computation happens inside Hardhat when it mines the block. Flask cannot predict it before that moment — hence the polling.

---

## 10. After the Receipt

```python
election.contract_address = receipt.contractAddress   # "0xe7f172..."
election.eligibility_locked = True
election.status = "scheduled"   # or "active" if start_time already passed
db.session.commit()
```

Flask saves the address to MySQL. From this point:

- All vote calls go to `0xe7f172...`
- The Merkle root, candidate IDs, start/end times are permanently baked into that contract
- Nobody — not even the platform — can change them

---

## 11. Full End-to-End Flow

```
Admin clicks "Lock & Deploy"
        ↓
Flask reads candidates from MySQL → [1, 2, 3]
        ↓
Flask reads election times from MySQL → start, end
        ↓
Flask encodes constructor args (ABI encoding)
        ↓
Flask loads bytecode from contracts/artifacts/EVoting.json
        ↓
deploy_data = bytecode + encoded_args
        ↓
Flask builds tx dict (from, to=None, data=deploy_data, gas, nonce, chainId)
        ↓
Flask signs tx with PLATFORM_PRIVATE_KEY → signed.raw_transaction
        ↓
RPC call 1: eth_getTransactionCount     → get nonce
RPC call 2: eth_sendRawTransaction      → submit to Hardhat
        ↓
Hardhat mines block, contract lives at 0xe7f172...
        ↓
RPC call 3+: eth_getTransactionReceipt  → poll until mined
        ↓
Receipt arrives with contractAddress = "0xe7f172..."
        ↓
Flask saves contract_address to MySQL → election is live
```

---

## 12. Background Workers — Redis & RQ

### Why RQ was designed into this project

Four operations are too slow to run inside a normal HTTP request:

| Operation | Why it's slow |
|-----------|--------------|
| Contract deployment | Waits for Hardhat to mine a block |
| Merkle tree generation | Hashing thousands of voter IDs |
| Election auto-ending | Needs to call `endElection()` on-chain at exact time |
| CSV voter import | Processing thousands of rows |

If Flask ran these inside the request, the browser would spin for 30+ seconds and likely time out.

The solution: **hand the work off to a background worker** and return a response immediately.

### What Redis and RQ are

**Redis** — an in-memory database. Used here purely as a message queue — a list of jobs waiting to be done.

**RQ (Redis Queue)** — a Python library. It puts jobs into Redis and worker processes pick them up and run them.

```
Admin clicks "Deploy"
        ↓
Flask puts job in Redis queue → returns "Deploying..." to browser immediately
        ↓
RQ worker (separate process) picks up job
        ↓
Worker runs lock_election_pipeline()
        ↓
Worker updates MySQL when done
```

### Why RQ is not actually being used right now

The worker crashes on macOS with a **SIGABRT** error. The reason is `os.fork()`.

---

## 13. What is os.fork()?

`os.fork()` is a Unix system call that **duplicates the running process**.

```
Flask process (PID 1234)
        │
        │  os.fork()
        │
   ┌────┴────┐
   │         │
Parent     Child
(PID 1234) (PID 1235)
continues  does the
serving    background
requests   job
```

The child is an exact copy of the parent at the moment of the fork — same memory, same open connections, same state.

RQ uses `os.fork()` internally to run each job in a child process.

---

## 14. What is SSL?

**SSL = Secure Sockets Layer** (technically now called TLS, but still called SSL colloquially)

It is the encryption layer that makes HTTPS secure. When two machines talk over HTTPS, SSL:
1. Encrypts the data so nobody can read it in transit
2. Verifies the identity of the server (certificates)

SSL is not just for web browsers. Any library that makes network connections loads SSL — including **web3.py**, because it might connect to remote Ethereum nodes over HTTPS.

---

## 15. The SIGABRT Crash — Why Fork + SSL Breaks on macOS

### The problem

SSL keeps internal locks to manage concurrent access safely. These locks track which thread holds them.

When `os.fork()` duplicates the process:

```
Parent process:
  SSL lock state: { thread_42 holds lock_A }
        │
        │  os.fork() → copies everything including this lock state
        │
Child process:
  SSL lock state: { thread_42 holds lock_A }  ← COPIED
  But thread_42 does not exist in the child!
```

The child inherited a lock that claims thread 42 holds it — but thread 42 was never copied (only the main thread survives a fork). The lock is now in an invalid state.

When the child tries to use SSL (which web3.py does automatically when imported), it detects the corrupted lock state and calls `abort()` → **SIGABRT crash**.

### Why this happens on macOS specifically

macOS uses a stricter implementation of SSL locks. Linux is more lenient and often lets it slide. So the same code works on Linux (where most servers run) but crashes on macOS (where you develop).

### How the project handles it currently

Since the worker crashes, `lock_election_pipeline()` runs **synchronously** — directly inside the Flask request, not in a background worker:

```python
# Instead of:
queue.enqueue(lock_election_pipeline, election_id)

# It runs directly:
lock_election_pipeline(election_id)
```

The browser waits until deployment finishes. This is fine for local development with Hardhat (fast mining), but would need proper RQ on a real server (Linux).

---

## 16. What is web3.py?

**web3.py** is a Python library that lets Flask talk to an Ethereum node.

Without web3.py, Flask would have to:
- Manually format JSON-RPC packets
- Open HTTP connections
- Handle retries and timeouts
- Parse raw hex responses

web3.py wraps all of that. You write Python and it handles the Ethereum protocol.

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))

# This single line hides an entire HTTP request to Hardhat:
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
```

### What web3.py loads at import time

When you `import web3` or `from web3 import Web3`, Python loads the web3 library — which internally imports SSL libraries, because web3 supports connecting to remote nodes over HTTPS.

This means **SSL is loaded into memory the moment Flask starts**, even if you're only connecting to a local Hardhat node over plain HTTP. The SSL library is just there in case it's needed.

This is why the fork crashes — SSL is already loaded and has locks set up by the time `os.fork()` runs.

### What web3.py connects to

| Environment | URL | Protocol |
|-------------|-----|----------|
| Local dev (Hardhat) | `http://127.0.0.1:8545` | Plain HTTP |
| Testnet (Sepolia) | `https://sepolia.infura.io/v3/...` | HTTPS (SSL active) |
| Mainnet | `https://mainnet.infura.io/v3/...` | HTTPS (SSL active) |

On local dev, SSL is loaded but not actively used for the connection. On testnet/mainnet, SSL encrypts every RPC call.

---

## 17. Key Concepts Summary

| Concept | What it is |
|---------|-----------|
| RPC | HTTP request to call a function on Hardhat from Flask |
| Bytecode | Compiled EVoting.sol machine code — the program logic |
| Constructor args | The actual election settings (candidates, times, Merkle root) |
| deploy_data | bytecode + constructor args concatenated into one blob |
| Signing | ECDSA math that proves the tx came from the platform wallet |
| tx_hash | Tracking number returned immediately after submission |
| receipt | Confirmation object returned after mining — contains contract address |
| PLATFORM_PRIVATE_KEY | The platform's secret key that authorises and pays for deployment |
| Signature recovery | How Ethereum derives the sender's public key from the signature — no prior registration needed |
| Nonce | Count of transactions sent from this wallet — prevents replay attacks |
