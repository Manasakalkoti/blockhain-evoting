"""
RQ jobs for election lifecycle:

  lock_election_pipeline — generate Merkle root + mock-deploy contract + transition status
  end_election_job       — call endElection() on contract + mark completed
"""


# ── Merkle tree ───────────────────────────────────────────────────────────────

def _build_merkle_root(leaves: list) -> str:
    """
    Build a sorted-pair Merkle root from a list of hex leaf hashes.
    Compatible with OpenZeppelin MerkleProof and the EVoting.sol contract.
    """
    from web3 import Web3

    if not leaves:
        return "0x" + "0" * 64

    def norm(h: str) -> bytes:
        h = h[2:] if h.startswith("0x") else h
        return bytes.fromhex(h.zfill(64))

    def hash_pair(a: bytes, b: bytes) -> bytes:
        if a <= b:
            return bytes(Web3.keccak(a + b))
        return bytes(Web3.keccak(b + a))

    layer = [norm(leaf) for leaf in leaves]

    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])  # duplicate last node if odd count
        layer = [hash_pair(layer[i], layer[i + 1]) for i in range(0, len(layer), 2)]

    return "0x" + layer[0].hex()


# ── Mock contract deploy ───────────────────────────────────────────────────────

def _mock_deploy_contract(election_id: str, merkle_root: str, candidate_count: int) -> str:
    """
    Deterministic fake Ethereum address derived from election params.
    Replace with a real web3.py + Hardhat/Anvil deployment when ready.
    """
    import hashlib
    seed = f"{election_id}:{merkle_root}:{candidate_count}"
    digest = hashlib.sha256(seed.encode()).hexdigest()
    return "0x" + digest[:40]


# ── Lock pipeline ─────────────────────────────────────────────────────────────

def lock_election_pipeline(election_id: str) -> dict:
    """
    Full lock pipeline (runs in RQ worker):
      1. Collect all voter hashes → build Merkle root
      2. Mock-deploy EVoting contract
      3. Update election: lock flags, merkle root, contract address, status
    """
    from datetime import datetime
    from app import create_app, db
    from app.models.election import Election
    from app.models.candidate import Candidate

    app = create_app()
    with app.app_context():
        election = Election.query.get(election_id)
        if not election:
            raise ValueError(f"Election {election_id} not found")

        constituencies = election.constituencies.all()

        # Collect leaves and candidate count
        all_leaves = []
        candidate_count = 0
        for c in constituencies:
            for ev in c.election_voters.all():
                all_leaves.append(ev.hashed_identifier)
            candidate_count += c.candidates.filter_by(status="active").count()

        # Build Merkle root (public elections get zero root)
        if election.visibility_type == "private" and all_leaves:
            merkle_root = _build_merkle_root(all_leaves)
        else:
            merkle_root = "0x" + "0" * 64

        # Mock deploy
        contract_address = _mock_deploy_contract(election_id, merkle_root, candidate_count)

        # Persist
        now = datetime.utcnow()
        election.eligibility_merkle_root = merkle_root
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
            "voter_count": len(all_leaves),
            "candidate_count": candidate_count,
        }


# ── End election ──────────────────────────────────────────────────────────────

def end_election_job(election_id: str) -> dict:
    """
    End election (runs in RQ worker):
      1. Call endElection() on deployed contract  (mock for now)
      2. Mark election completed + publish results
    """
    from datetime import datetime
    from app import create_app, db
    from app.models.election import Election

    app = create_app()
    with app.app_context():
        election = Election.query.get(election_id)
        if not election:
            raise ValueError(f"Election {election_id} not found")

        # TODO: real call →
        #   from web3 import Web3
        #   w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL")))
        #   contract = w3.eth.contract(address=election.contract_address, abi=EVOTING_ABI)
        #   tx = contract.functions.endElection().transact({"from": admin_wallet})
        #   w3.eth.wait_for_transaction_receipt(tx)

        ended_at = datetime.utcnow()
        election.status = "completed"
        election.results_published = True
        db.session.commit()

        return {
            "election_id": election_id,
            "status": "completed",
            "ended_at": ended_at.isoformat(),
        }
