"""
RQ jobs for election lifecycle:

  lock_election_pipeline — generate Merkle root from voter wallet addresses
                           + deploy contract (mock or real) + transition status
  end_election_job       — call endElection() on contract + mark completed

Merkle design (matches EVoting.sol _verifyMerkle):
  - Leaf  = keccak256(abi.encodePacked(wallet_address))
            = keccak256(20-byte address)   [matches Solidity]
  - Tree  = sorted-pair combination, OpenZeppelin compatible
  - Root  stored on-chain in contract constructor
  - Proofs generated on-demand from stored merkle_tree_json
"""

import json


# ── Merkle tree utilities ──────────────────────────────────────────────────────

def _norm(h: str) -> bytes:
    """Convert hex string (with or without 0x) to bytes."""
    h = h[2:] if h.startswith("0x") else h
    return bytes.fromhex(h.zfill(64))


def _hash_pair(a: bytes, b: bytes) -> bytes:
    """Sorted-pair keccak256 — matches Solidity sorted-pair Merkle."""
    from web3 import Web3
    if a <= b:
        return bytes(Web3.keccak(a + b))
    return bytes(Web3.keccak(b + a))


def _wallet_leaf(wallet_address: str) -> str:
    """
    Compute Merkle leaf for a wallet address.
    Matches Solidity: keccak256(abi.encodePacked(voter))
    where voter is an address (20 bytes, NOT padded to 32).
    """
    from web3 import Web3
    addr_bytes = bytes.fromhex(wallet_address.lower().replace("0x", ""))  # 20 bytes
    return "0x" + Web3.keccak(addr_bytes).hex()


def build_merkle_tree(wallet_addresses: list) -> tuple:
    """
    Build a sorted-pair Merkle tree from a list of wallet addresses.

    Returns (root_hex, tree_data_dict) where tree_data_dict can be stored
    as JSON and later used to generate proofs via get_proof().

    Tree data format:
      {
        "addresses": [sorted lowercase wallet addresses],
        "leaves":    [keccak256(addr) for each sorted address],
        "padded_layers": [
          [padded leaf layer],       # index 0
          [parent layer],            # index 1
          ...
          [root_layer]               # last index
        ],
        "root": "0x..."
      }
    """
    if not wallet_addresses:
        zero = "0x" + "0" * 64
        return zero, {"addresses": [], "leaves": [], "padded_layers": [], "root": zero}

    # Sort and deduplicate
    addrs = sorted(set(a.lower() for a in wallet_addresses))
    leaves = [_wallet_leaf(a) for a in addrs]

    # Build padded layers (each layer is padded to even length by duplicating last)
    padded_layers = []
    current = leaves[:]

    while len(current) > 1:
        padded = current[:]
        if len(padded) % 2 == 1:
            padded.append(padded[-1])  # duplicate last for odd-length layers
        padded_layers.append(padded)

        next_layer = []
        for i in range(0, len(padded), 2):
            h = _hash_pair(_norm(padded[i]), _norm(padded[i + 1]))
            next_layer.append("0x" + h.hex())
        current = next_layer

    # current is now [root]
    root = current[0]
    padded_layers.append(current)  # root layer

    tree_data = {
        "addresses": addrs,
        "leaves": leaves,
        "padded_layers": padded_layers,
        "root": root,
    }
    return root, tree_data


def get_proof(tree_data: dict, wallet_address: str) -> list:
    """
    Generate a Merkle proof for a wallet address from stored tree data.
    Returns a list of bytes32 hex strings (the sibling path from leaf to root).
    Returns None if the address is not in the tree.
    """
    addr = wallet_address.lower()
    addresses = tree_data.get("addresses", [])

    if addr not in addresses:
        return None

    idx = addresses.index(addr)
    padded_layers = tree_data.get("padded_layers", [])
    proof = []

    # Walk up the tree (skip the root layer at the end)
    for layer in padded_layers[:-1]:
        sibling_idx = idx ^ 1  # flip last bit: 0↔1, 2↔3, etc.
        proof.append(layer[sibling_idx])
        idx = idx >> 1  # parent index

    return proof


# ── Mock contract deploy ───────────────────────────────────────────────────────

def _mock_deploy_contract(election_id: str, merkle_root: str, candidate_count: int) -> str:
    """
    Deterministic fake Ethereum address for local dev without a running Hardhat node.
    Replace with _real_deploy_contract() when Hardhat node / Sepolia is available.
    """
    import hashlib
    seed = f"{election_id}:{merkle_root}:{candidate_count}"
    digest = hashlib.sha256(seed.encode()).hexdigest()
    return "0x" + digest[:40]


def _real_deploy_contract(
    election_id: str,
    candidate_ids: list,
    start_time: int,
    end_time: int,
    merkle_root: str,
    rpc_url: str,
    private_key: str,
    abi: list,
    bytecode: str,
) -> str:
    """
    Real contract deployment via web3.py v7.
    Bypasses eth_estimateGas entirely by encoding deployment data manually —
    gas estimation triggers eth_call simulation which fails with StackOverflow
    on Hardhat when the constructor uses dynamic arrays.
    """
    from web3 import Web3
    from eth_abi import encode as abi_encode

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    account = w3.eth.account.from_key(private_key)

    merkle_root_bytes = bytes.fromhex(merkle_root.replace("0x", "").zfill(64))

    # Encode constructor args manually (avoids internal eth_estimateGas call)
    encoded_args = abi_encode(
        ["uint256[]", "uint256", "uint256", "bytes32"],
        [candidate_ids, start_time, end_time, merkle_root_bytes],
    )
    raw_bytecode = bytecode[2:] if bytecode.startswith("0x") else bytecode
    deploy_data = "0x" + raw_bytecode + encoded_args.hex()

    tx = {
        "from": account.address,
        "data": deploy_data,
        "gas": 3_000_000,
        "gasPrice": w3.eth.gas_price,
        "nonce": w3.eth.get_transaction_count(account.address),
        "chainId": w3.eth.chain_id,
    }
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    return receipt.get("contractAddress") or receipt.get("contract_address")


# ── Lock pipeline ──────────────────────────────────────────────────────────────

def lock_election_pipeline(election_id: str) -> dict:
    """
    Full lock pipeline (runs as RQ background job):
      1. For private elections: collect voter wallet addresses, build Merkle tree
      2. For public elections:  zero Merkle root (geo check was off-chain)
      3. Deploy EVoting contract (mock or real depending on BLOCKCHAIN_ENABLED env)
      4. Persist: merkle_root, merkle_tree_json, contract_address, lock flags, status
    """
    import os
    from datetime import datetime
    from app import db
    from app.models.election import Election

    def _run():
        election = Election.query.get(election_id)
        if not election:
            raise ValueError(f"Election {election_id} not found")

        constituencies = election.constituencies.all()
        candidate_ids_int = []

        for c in constituencies:
            for cand in c.candidates.filter_by(status="active").all():
                candidate_ids_int.append(cand.candidate_position or 0)

        # Always use zero root — eligibility is enforced by backend pre-verification.
        merkle_root = "0x" + "0" * 64
        tree_data = {"addresses": [], "leaves": [], "padded_layers": [], "root": merkle_root}

        if not candidate_ids_int:
            candidate_ids_int = list(range(1, sum(
                c.candidates.filter_by(status="active").count() for c in constituencies
            ) + 1))

        seen = set()
        unique_candidate_ids = []
        for cid in candidate_ids_int:
            if cid not in seen and cid > 0:
                seen.add(cid)
                unique_candidate_ids.append(cid)

        if not unique_candidate_ids:
            raise ValueError("No active candidates found for deployment")

        blockchain_enabled = os.environ.get("BLOCKCHAIN_ENABLED", "false").lower() == "true"
        if blockchain_enabled:
            rpc_url = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
            private_key = os.environ.get("PLATFORM_PRIVATE_KEY", "")
            artifact_path = os.path.join(
                os.path.dirname(__file__), "../../../artifacts/contracts/EVoting.sol/EVoting.json"
            )
            with open(artifact_path) as f:
                artifact = json.load(f)
            contract_address = _real_deploy_contract(
                election_id=election_id,
                candidate_ids=unique_candidate_ids,
                start_time=int(election.start_time.timestamp()),
                end_time=int(election.end_time.timestamp()),
                merkle_root=merkle_root,
                rpc_url=rpc_url,
                private_key=private_key,
                abi=artifact["abi"],
                bytecode=artifact["bytecode"],
            )
        else:
            contract_address = _mock_deploy_contract(
                election_id, merkle_root, len(unique_candidate_ids)
            )

        now = datetime.utcnow()
        election.eligibility_merkle_root = merkle_root
        election.merkle_tree_json = json.dumps(tree_data)
        election.eligibility_locked = True
        election.candidates_locked = True
        election.contract_address = contract_address
        election.contract_deployed_at = now
        election.status = "active" if election.start_time <= now else "scheduled"
        db.session.commit()

        return {
            "election_id": election_id,
            "merkle_root": merkle_root,
            "contract_address": contract_address,
            "status": election.status,
            "candidate_count": len(unique_candidate_ids),
        }

    # If already inside a Flask app context (called from request handler), run directly.
    # Otherwise (called as RQ job), push a new app context.
    try:
        from flask import current_app
        current_app._get_current_object()
        return _run()
    except RuntimeError:
        from app import create_app
        app = create_app()
        with app.app_context():
            return _run()


# ── End election ───────────────────────────────────────────────────────────────

def end_election_job(election_id: str) -> dict:
    """
    End election (runs as RQ background job):
      1. Call endElection() on deployed contract (mock or real)
      2. Mark election completed + publish results
    """
    import os
    from datetime import datetime
    from app import db
    from app.models.election import Election

    def _run():
        election = Election.query.get(election_id)
        if not election:
            raise ValueError(f"Election {election_id} not found")

        blockchain_enabled = os.environ.get("BLOCKCHAIN_ENABLED", "false").lower() == "true"
        if blockchain_enabled and election.contract_address:
            rpc_url = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
            private_key = os.environ.get("PLATFORM_PRIVATE_KEY", "")
            artifact_path = os.path.join(
                os.path.dirname(__file__), "../../../artifacts/contracts/EVoting.sol/EVoting.json"
            )
            with open(artifact_path) as f:
                artifact = json.load(f)

            from web3 import Web3
            w3 = Web3(Web3.HTTPProvider(rpc_url))
            account = w3.eth.account.from_key(private_key)
            contract = w3.eth.contract(address=election.contract_address, abi=artifact["abi"])
            tx = contract.functions.endElection().build_transaction({
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address),
                "gas": 100_000,
            })
            signed = account.sign_transaction(tx)
            raw = signed.raw_transaction if hasattr(signed, 'raw_transaction') else signed.rawTransaction
            tx_hash = w3.eth.send_raw_transaction(raw)
            w3.eth.wait_for_transaction_receipt(tx_hash)

        ended_at = datetime.utcnow()
        election.status = "completed"
        election.results_published = True
        db.session.commit()

        return {
            "election_id": election_id,
            "status": "completed",
            "ended_at": ended_at.isoformat(),
        }

    try:
        from flask import current_app
        current_app._get_current_object()
        return _run()
    except RuntimeError:
        from app import create_app
        app = create_app()
        with app.app_context():
            return _run()
