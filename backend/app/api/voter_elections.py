import json
import os
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from app import db
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_verification import VoterVerification
from app.models.vote_transaction import VoteTransaction
from app.api.middleware import require_jwt

voter_elections_bp = Blueprint("voter_elections", __name__)


def _candidate_dict(c):
    return {
        "candidate_id": c.candidate_id,
        "candidate_name": c.candidate_name,
        "candidate_identifier": c.candidate_identifier,
        "party_name": c.party_name,
        "symbol_url": c.symbol_url,
        "manifesto": c.manifesto,
        "candidate_position": c.candidate_position,
        "constituency_id": c.constituency_id,
        "constituency_name": c.constituency.constituency_name if c.constituency else None,
    }


def _verification_status(election_id, user_id):
    """Return 'verified', 'not_eligible', or None (not attempted)."""
    vv = VoterVerification.query.filter_by(
        election_id=election_id, user_id=user_id
    ).order_by(VoterVerification.created_at.desc()).first()
    if vv is None:
        return None
    return "verified" if vv.verified else "not_eligible"


# ── Voter Elections List ──────────────────────────────────────────────────────

@voter_elections_bp.route("/api/voter/elections", methods=["GET"])
@require_jwt
def voter_list_elections():
    """Return scheduled/active/completed elections grouped by status."""
    # Only show elections that are past draft state
    elections = (
        Election.query
        .filter(Election.status.in_(["scheduled", "active", "completed"]))
        .order_by(Election.start_time.asc())
        .all()
    )

    upcoming, running, completed = [], [], []

    for e in elections:
        verif = _verification_status(e.election_id, g.user_id)
        card = {
            "election_id": e.election_id,
            "title": e.title,
            "description": e.description,
            "election_type": e.election_type,
            "visibility_type": e.visibility_type,
            "start_time": e.start_time.isoformat(),
            "end_time": e.end_time.isoformat(),
            "status": e.status,
            "results_published": e.results_published,
            "verification_status": verif,
        }
        if e.status == "active":
            running.append(card)
        elif e.status == "scheduled":
            upcoming.append(card)
        else:  # completed
            completed.append(card)

    return jsonify({"upcoming": upcoming, "running": running, "completed": completed})


# ── Voter Election Detail ─────────────────────────────────────────────────────

@voter_elections_bp.route("/api/voter/elections/<election_id>", methods=["GET"])
@require_jwt
def voter_get_election(election_id):
    """Return election detail + candidates + voter's verification status."""
    election = Election.query.get_or_404(election_id)

    if election.status == "draft":
        return jsonify({"message": "Election not available"}), 404

    constituencies = election.constituencies.all()
    candidates = []
    for c in constituencies:
        for cand in (
            c.candidates.filter_by(status="active")
            .order_by(Candidate.candidate_position)
            .all()
        ):
            candidates.append(_candidate_dict(cand))

    location_rules = None
    if election.location_rules:
        try:
            location_rules = json.loads(election.location_rules)
        except (ValueError, TypeError):
            pass

    verif = _verification_status(election_id, g.user_id)

    return jsonify({
        "election": {
            "election_id": election.election_id,
            "title": election.title,
            "description": election.description,
            "election_type": election.election_type,
            "visibility_type": election.visibility_type,
            "start_time": election.start_time.isoformat(),
            "end_time": election.end_time.isoformat(),
            "status": election.status,
            "results_published": election.results_published,
            "eligibility_locked": election.eligibility_locked,
            "location_rules": location_rules,
            "candidates": candidates,
            "verification_status": verif,
        }
    })


# ── Pre-Verification ──────────────────────────────────────────────────────────

@voter_elections_bp.route("/api/voter/elections/<election_id>/verify", methods=["POST"])
@require_jwt
def verify_eligibility(election_id):
    """
    One-time pre-verification for a voter.
    - Private: voter submits their student_id / employee_id; checked against election_voters table.
    - Public: voter's pincode/city/district is checked against locked location_rules (GEO_MOCK).
    """
    from app.models.user import User
    from app.models.election_voter import ElectionVoter

    election = Election.query.get_or_404(election_id)

    if election.status not in ("scheduled", "active"):
        return jsonify({"message": "Verification is only available for scheduled or active elections"}), 400

    # Check if already verified
    existing = VoterVerification.query.filter_by(
        election_id=election_id, user_id=g.user_id, verified=True
    ).first()
    if existing:
        return jsonify({"verified": True, "message": "Already verified for this election"})

    user = User.query.get_or_404(g.user_id)

    # ── Private election: ID-based check ─────────────────────────────────────
    if election.visibility_type == "private":
        data = request.get_json(silent=True) or {}
        submitted_id = (data.get("voter_id") or "").strip()

        if not submitted_id:
            return jsonify({"message": "voter_id is required for private elections"}), 400

        # Check against user's own stored IDs
        if submitted_id not in filter(None, [user.student_id, user.employee_id]):
            vv = VoterVerification(
                user_id=g.user_id,
                election_id=election_id,
                method="id_verification",
                verified=False,
            )
            db.session.add(vv)
            db.session.commit()
            return jsonify({
                "verified": False,
                "message": "The ID you entered does not match your registered profile"
            }), 400

        # Check against the election's authorized voter list (across all constituencies)
        constituencies = election.constituencies.all()
        matched = False
        for c in constituencies:
            ev = ElectionVoter.query.filter_by(
                constituency_id=c.constituency_id,
                voter_identifier=submitted_id,
            ).first()
            if ev:
                matched = True
                break

        verified = matched
        vv = VoterVerification(
            user_id=g.user_id,
            election_id=election_id,
            method="id_verification",
            verified=verified,
            verified_at=datetime.utcnow() if verified else None,
        )
        db.session.add(vv)
        db.session.commit()

        if verified:
            return jsonify({"verified": True, "message": "You are eligible to vote in this election"})
        return jsonify({"verified": False, "message": "Your ID is not on the authorized voter list"}), 400

    # ── Public election: address-based check (GEO_MOCK) ──────────────────────
    else:
        if not election.eligibility_locked or not election.location_rules:
            return jsonify({"message": "Geographic eligibility rules have not been configured yet"}), 400

        try:
            rules = json.loads(election.location_rules)
        except (ValueError, TypeError):
            return jsonify({"message": "Invalid eligibility rules"}), 500

        districts = [d.lower() for d in rules.get("districts", [])]
        wards = [w.lower() for w in rules.get("wards", [])]
        pincodes = rules.get("pincodes", [])

        voter_pincode = (user.pincode or "").strip()
        voter_city = (user.city or "").lower().strip()

        # GEO_MOCK: simple text match against pincode and city/district
        matched = (
            (voter_pincode and voter_pincode in pincodes)
            or (voter_city and voter_city in districts)
            or (voter_city and voter_city in wards)
        )

        verified = matched
        vv = VoterVerification(
            user_id=g.user_id,
            election_id=election_id,
            method="address_verification",
            verified=verified,
            verified_at=datetime.utcnow() if verified else None,
        )
        db.session.add(vv)
        db.session.commit()

        if verified:
            return jsonify({
                "verified": True,
                "message": "Your address falls within the election's geographic boundary"
            })
        return jsonify({
            "verified": False,
            "message": "Your registered address is not within the eligible geographic area for this election",
            "your_address": {
                "city": user.city,
                "pincode": user.pincode,
                "state": user.state,
            }
        }), 400


# ── Merkle Proof ───────────────────────────────────────────────────────────────

@voter_elections_bp.route("/api/voter/elections/<election_id>/merkle-proof", methods=["GET"])
@require_jwt
def get_merkle_proof(election_id):
    """
    Return a Merkle proof for the authenticated voter's wallet address.
    Called by the frontend just before submitting the vote transaction.

    The voter must:
      1. Have been pre-verified for this election.
      2. Have a wallet_address linked to their account.

    Query param: voter=<wallet_address>  (must match user's registered wallet)
    """
    from app.models.user import User
    from app.jobs.merkle_jobs import get_proof

    election = Election.query.get_or_404(election_id)

    if election.visibility_type == "public":
        # Public elections use zero Merkle root — no proof needed
        return jsonify({"merkle_proof": [], "is_public": True})

    if not election.eligibility_locked or not election.merkle_tree_json:
        return jsonify({"message": "Eligibility has not been locked yet"}), 400

    # Voter must be pre-verified
    verification = VoterVerification.query.filter_by(
        election_id=election_id,
        user_id=g.user_id,
        verified=True,
    ).first()
    if not verification:
        return jsonify({"message": "You are not verified for this election"}), 403

    user = User.query.get_or_404(g.user_id)
    if not user.wallet_address:
        return jsonify({"message": "Link a wallet address to your account before voting"}), 400

    # Optional: allow voter to specify wallet (must match registered)
    requested_wallet = (request.args.get("voter") or "").strip().lower()
    if requested_wallet and requested_wallet != user.wallet_address.lower():
        return jsonify({"message": "Wallet address does not match your registered address"}), 403

    wallet = user.wallet_address.lower()

    try:
        tree_data = json.loads(election.merkle_tree_json)
    except (ValueError, TypeError):
        return jsonify({"message": "Merkle tree data is corrupted"}), 500

    proof = get_proof(tree_data, wallet)
    if proof is None:
        return jsonify({
            "message": "Your wallet address is not in the eligibility list. "
                       "The admin may need to re-lock the election after you link your wallet."
        }), 403

    return jsonify({
        "merkle_proof": proof,
        "wallet_address": wallet,
        "election_id": election_id,
    })


# ── Election Results ────────────────────────────────────────────────────────────

@voter_elections_bp.route("/api/voter/elections/<election_id>/results", methods=["GET"])
@require_jwt
def get_election_results(election_id):
    """
    Return election results for display on the Results page.

    For completed elections, reads vote tallies from:
      1. On-chain via web3.py getResults() call (if BLOCKCHAIN_ENABLED=true)
      2. DB vote_transactions table (always available, used as fallback)

    Response:
      title, contract_address, candidates (with vote counts), transactions (audit log)
    """
    election = Election.query.get_or_404(election_id)

    if not election.results_published and election.status != "completed":
        return jsonify({"message": "Results are not yet available"}), 400

    # Build candidate map from DB
    constituencies = election.constituencies.all()
    candidates_db = []
    candidate_map = {}  # candidate_position → candidate info
    for c in constituencies:
        for cand in c.candidates.filter_by(status="active").order_by(Candidate.candidate_position).all():
            info = {
                "candidate_id": cand.candidate_id,
                "candidate_name": cand.candidate_name,
                "party_name": cand.party_name,
                "position": cand.candidate_position,
                "votes": 0,
            }
            candidates_db.append(info)
            candidate_map[str(cand.candidate_position)] = info

    # Fetch vote transactions for audit log
    transactions = VoteTransaction.query.filter_by(election_id=election_id).all()

    # Count votes from DB transactions (fallback always works)
    for tx in transactions:
        cid = str(tx.candidate_id)
        if cid in candidate_map:
            candidate_map[cid]["votes"] += 1

    # Try to fetch on-chain results (more authoritative)
    blockchain_enabled = os.environ.get("BLOCKCHAIN_ENABLED", "false").lower() == "true"
    on_chain_counts = None
    if blockchain_enabled and election.contract_address:
        try:
            on_chain_counts = _fetch_on_chain_results(election.contract_address)
        except Exception:
            on_chain_counts = None  # fall back to DB counts silently

    # If on-chain data available, use it to override DB counts
    if on_chain_counts:
        for position_str, count in on_chain_counts.items():
            if position_str in candidate_map:
                candidate_map[position_str]["votes"] = count

    return jsonify({
        "election_id": election.election_id,
        "title": election.title,
        "status": election.status,
        "contract_address": election.contract_address,
        "candidates": candidates_db,
        "transactions": [
            {
                "blockchain_tx_hash": tx.blockchain_tx_hash,
                "wallet_address": tx.wallet_address,
                "timestamp": tx.timestamp.isoformat(),
            }
            for tx in transactions
        ],
        "total_votes": len(transactions),
    })


def _fetch_on_chain_results(contract_address: str) -> dict:
    """
    Call getResults() on the deployed EVoting contract.
    Returns {candidate_position_str: vote_count} or raises on failure.
    """
    import json as _json
    from web3 import Web3
    rpc_url = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
    artifact_path = os.path.join(
        os.path.dirname(__file__),
        "../../../../artifacts/contracts/EVoting.sol/EVoting.json"
    )
    with open(artifact_path) as f:
        artifact = _json.load(f)
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    contract = w3.eth.contract(address=contract_address, abi=artifact["abi"])
    ids, counts = contract.functions.getResults().call()
    return {str(int(ids[i])): int(counts[i]) for i in range(len(ids))}
