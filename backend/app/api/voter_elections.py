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


def _auto_transition_elections():
    """
    Lazily transition election statuses based on current time.
    Called before any voter-facing election fetch so no scheduler is needed.
      scheduled → active   when start_time has passed
      active    → completed when end_time has passed
    """
    now = datetime.now()

    # scheduled → active
    Election.query.filter(
        Election.status == "scheduled",
        Election.start_time <= now,
    ).update({"status": "active"}, synchronize_session=False)

    # locked draft (contract deployed) whose start_time has passed → active
    Election.query.filter(
        Election.status == "draft",
        Election.eligibility_locked == True,
        Election.contract_address.isnot(None),
        Election.start_time <= now,
    ).update({"status": "active"}, synchronize_session=False)

    # active → completed
    ending = Election.query.filter(
        Election.status == "active",
        Election.end_time <= now,
    ).all()
    for e in ending:
        e.status = "completed"
        e.results_published = True

    db.session.commit()


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


# ── Follow / Unfollow Organisation ───────────────────────────────────────────

@voter_elections_bp.route("/api/voter/follow/<org_id>", methods=["POST"])
@require_jwt
def follow_org(org_id):
    from app.models.voter_followed_org import VoterFollowedOrg
    from app.models.organization import Organization
    org = Organization.query.filter_by(organization_id=org_id, verified=True, deleted=False).first()
    if not org:
        return jsonify({"message": "Organisation not found"}), 404
    existing = VoterFollowedOrg.query.filter_by(user_id=g.user_id, organization_id=org_id).first()
    if existing:
        return jsonify({"message": "Already following", "following": True})
    follow = VoterFollowedOrg(user_id=g.user_id, organization_id=org_id)
    db.session.add(follow)
    db.session.commit()
    return jsonify({"message": f"Now following {org.name}", "following": True})


@voter_elections_bp.route("/api/voter/follow/<org_id>", methods=["DELETE"])
@require_jwt
def unfollow_org(org_id):
    from app.models.voter_followed_org import VoterFollowedOrg
    VoterFollowedOrg.query.filter_by(user_id=g.user_id, organization_id=org_id).delete()
    db.session.commit()
    return jsonify({"message": "Unfollowed", "following": False})


@voter_elections_bp.route("/api/voter/following", methods=["GET"])
@require_jwt
def get_following():
    """Return list of orgs the voter follows + their active/upcoming elections."""
    from app.models.voter_followed_org import VoterFollowedOrg
    from app.models.organization import Organization
    _auto_transition_elections()

    follows = VoterFollowedOrg.query.filter_by(user_id=g.user_id).all()
    result = []
    for f in follows:
        org = Organization.query.get(f.organization_id)
        if not org or org.deleted:
            continue
        elections = (
            Election.query
            .filter(
                Election.organization_id == org.organization_id,
                Election.status.in_(["scheduled", "active", "completed"])
            )
            .order_by(Election.start_time.desc())
            .limit(5)
            .all()
        )
        result.append({
            "organization_id": org.organization_id,
            "name": org.name,
            "type": org.type,
            "elections": [
                {
                    "election_id": e.election_id,
                    "title": e.title,
                    "status": e.status,
                    "start_time": e.start_time.isoformat(),
                    "end_time": e.end_time.isoformat(),
                    "verification_status": _verification_status(e.election_id, g.user_id),
                }
                for e in elections
            ],
        })
    return jsonify({"following": result})


# ── Organisation Search for Voters ───────────────────────────────────────────

@voter_elections_bp.route("/api/voter/organisations", methods=["GET"])
@require_jwt
def search_organisations():
    """Search verified organisations by name. Used by voters to find their org."""
    from app.models.organization import Organization
    query = (request.args.get("q") or "").strip()
    orgs = Organization.query.filter_by(verified=True, deleted=False)
    if query:
        orgs = orgs.filter(Organization.name.ilike(f"%{query}%"))
    orgs = orgs.order_by(Organization.name).limit(20).all()
    return jsonify({
        "organisations": [
            {
                "organization_id": o.organization_id,
                "name": o.name,
                "type": o.type,
            }
            for o in orgs
        ]
    })


# ── Voter Elections List (by org) ─────────────────────────────────────────────

@voter_elections_bp.route("/api/voter/organisations/<org_id>/elections", methods=["GET"])
@require_jwt
def voter_list_elections_by_org(org_id):
    """Return elections for a specific organisation grouped by status."""
    _auto_transition_elections()
    elections = (
        Election.query
        .filter(
            Election.organization_id == org_id,
            Election.status.in_(["scheduled", "active", "completed"])
        )
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
        else:
            completed.append(card)

    return jsonify({"upcoming": upcoming, "running": running, "completed": completed})


# ── Voter Elections List (all — kept for backward compat) ────────────────────

@voter_elections_bp.route("/api/voter/elections", methods=["GET"])
@require_jwt
def voter_list_elections():
    """Return scheduled/active/completed elections grouped by status."""
    _auto_transition_elections()
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
    _auto_transition_elections()
    election = Election.query.get_or_404(election_id)

    if election.status == "draft":
        return jsonify({"message": "Election not available"}), 404

    constituencies_raw = election.constituencies.all()
    candidates = []
    constituencies_out = []
    for c in constituencies_raw:
        c_candidates = (
            c.candidates.filter_by(status="active")
            .order_by(Candidate.candidate_position)
            .all()
        )
        cand_dicts = [_candidate_dict(cand) for cand in c_candidates]
        candidates.extend(cand_dicts)

        # Parse location_rules for this constituency
        c_rules = None
        if c.location_rules:
            try:
                c_rules = json.loads(c.location_rules)
            except (ValueError, TypeError):
                pass

        constituencies_out.append({
            "constituency_id": c.constituency_id,
            "constituency_name": c.constituency_name,
            "location_rules": c_rules,
            "candidates": cand_dicts,
        })

    location_rules = None
    if election.location_rules:
        try:
            location_rules = json.loads(election.location_rules)
        except (ValueError, TypeError):
            pass

    verif = _verification_status(election_id, g.user_id)

    # For public elections: tell the voter which constituency they verified for
    verified_constituency = None
    if verif == "verified" and election.visibility_type == "public":
        vv = VoterVerification.query.filter_by(
            election_id=election_id, user_id=g.user_id, verified=True
        ).first()
        if vv and vv.constituency_id:
            verified_constituency = {
                "constituency_id": vv.constituency_id,
                "constituency_name": vv.constituency.constituency_name if vv.constituency else None,
            }

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
            "contract_address": election.contract_address,
            "candidates": candidates,
            "constituencies": constituencies_out,
            "verification_status": verif,
            "verified_constituency": verified_constituency,
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

        # Delete any previous failed attempt so voter can retry with correct ID
        VoterVerification.query.filter_by(
            election_id=election_id, user_id=g.user_id, verified=False
        ).delete()

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

    # ── Public election: Aadhaar + address-based check (mock KYC) ───────────────
    else:
        import hashlib
        import re as _re

        if not election.eligibility_locked:
            return jsonify({"message": "Geographic eligibility rules have not been configured yet"}), 400

        data = request.get_json(silent=True) or {}
        aadhaar_number    = (data.get("aadhaar_number") or "").strip()
        submitted_address = (data.get("address_line") or "").strip()
        submitted_city    = (data.get("city") or "").strip()
        submitted_state   = (data.get("state") or "").strip()
        submitted_pincode = (data.get("pincode") or "").strip()

        # All fields required
        if not aadhaar_number:
            return jsonify({"message": "Aadhaar number is required"}), 400
        if not _re.match(r'^\d{12}$', aadhaar_number):
            return jsonify({"message": "Invalid Aadhaar number. Must be exactly 12 digits."}), 400
        if not submitted_address:
            return jsonify({"message": "Address line is required"}), 400
        if not submitted_city:
            return jsonify({"message": "City / District is required"}), 400
        if not submitted_state:
            return jsonify({"message": "State is required"}), 400
        if not submitted_pincode:
            return jsonify({"message": "Pincode is required"}), 400

        # Hash the Aadhaar — never store raw number
        aadhaar_hash = hashlib.sha256(aadhaar_number.encode()).hexdigest()

        # Check if this Aadhaar has already been verified for this election
        aadhaar_used = VoterVerification.query.filter_by(
            election_id=election_id,
            aadhaar_hash=aadhaar_hash,
            verified=True,
        ).first()
        if aadhaar_used:
            return jsonify({
                "message": "This Aadhaar number has already been used to verify for this election"
            }), 403

        # Find which constituency's rules match the voter's submitted address
        constituencies = election.constituencies.all()
        matched_constituency = None
        city_lower = submitted_city.lower()

        for c in constituencies:
            if not c.location_rules:
                continue
            try:
                rules = json.loads(c.location_rules)
            except (ValueError, TypeError):
                continue
            c_districts = [d.lower() for d in rules.get("districts", [])]
            c_wards     = [w.lower() for w in rules.get("wards", [])]
            c_pincodes  = rules.get("pincodes", [])

            if (
                (submitted_pincode and submitted_pincode in c_pincodes)
                or (city_lower and city_lower in c_districts)
                or (city_lower and city_lower in c_wards)
            ):
                matched_constituency = c
                break

        # Delete any previous failed attempt so voter can retry
        VoterVerification.query.filter_by(
            election_id=election_id, user_id=g.user_id, verified=False
        ).delete()

        if not matched_constituency:
            db.session.commit()
            return jsonify({
                "verified": False,
                "message": "Your address does not fall within any constituency's eligible area for this election",
                "submitted_address": {"city": submitted_city, "pincode": submitted_pincode},
            }), 400

        vv = VoterVerification(
            user_id=g.user_id,
            election_id=election_id,
            constituency_id=matched_constituency.constituency_id,
            method="address_verification",
            verified=True,
            verified_at=datetime.utcnow(),
            aadhaar_hash=aadhaar_hash,
        )
        db.session.add(vv)
        db.session.commit()

        return jsonify({
            "verified": True,
            "constituency_id": matched_constituency.constituency_id,
            "constituency_name": matched_constituency.constituency_name,
            "message": f"Verified! You belong to → {matched_constituency.constituency_name}",
        })


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
    election = Election.query.get_or_404(election_id)

    # All elections use zero Merkle root — no on-chain proof needed.
    # Eligibility is enforced by backend pre-verification (voter ID / address check).
    verification = VoterVerification.query.filter_by(
        election_id=election_id,
        user_id=g.user_id,
        verified=True,
    ).first()
    if not verification:
        return jsonify({"message": "You are not verified for this election"}), 403

    return jsonify({
        "merkle_proof": [],
        "election_id": election_id,
    })


# ── My Vote History ────────────────────────────────────────────────────────────

@voter_elections_bp.route("/api/voter/my-votes", methods=["GET"])
@require_jwt
def my_vote_history():
    """Return all elections the logged-in voter has voted in, with tx hashes."""
    from app.models.organization import Organization

    txs = (
        VoteTransaction.query
        .filter_by(voter_id=g.user_id)
        .order_by(VoteTransaction.timestamp.desc())
        .all()
    )

    history = []
    for tx in txs:
        e = tx.election
        org_name = None
        if e and e.organization_id:
            org = Organization.query.get(e.organization_id)
            org_name = org.name if org else None
        history.append({
            "election_id": tx.election_id,
            "election_title": e.title if e else "Unknown Election",
            "election_status": e.status if e else None,
            "org_name": org_name,
            "contract_address": e.contract_address if e else None,
            "blockchain_tx_hash": tx.blockchain_tx_hash,
            "wallet_address": tx.wallet_address,
            "voted_at": tx.timestamp.isoformat(),
        })

    return jsonify({"votes": history, "total": len(history)})


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

    if election.status not in ("active", "completed"):
        return jsonify({"message": "Results are not yet available"}), 400
    if election.status == "completed" and not election.results_published:
        return jsonify({"message": "Results are not yet available"}), 400

    is_live = election.status == "active"

    # Build candidate map keyed by candidate_position (globally unique within election)
    constituencies = election.constituencies.all()
    candidate_map = {}  # position_str → candidate info dict (includes constituency fields)
    constituency_order = []  # preserve constituency ordering

    for c in constituencies:
        cands_in_c = []
        for cand in c.candidates.filter_by(status="active").order_by(Candidate.candidate_position).all():
            info = {
                "candidate_id": cand.candidate_id,
                "candidate_name": cand.candidate_name,
                "party_name": cand.party_name,
                "symbol_url": cand.symbol_url,
                "position": cand.candidate_position,
                "constituency_id": c.constituency_id,
                "constituency_name": c.constituency_name,
                "votes": 0,
            }
            cands_in_c.append(info)
            candidate_map[str(cand.candidate_position)] = info
        constituency_order.append({
            "constituency_id": c.constituency_id,
            "constituency_name": c.constituency_name,
            "candidates": cands_in_c,
        })

    # Fetch vote transactions for audit log
    transactions = VoteTransaction.query.filter_by(election_id=election_id).all()

    # Count votes from DB transactions (fallback always works)
    for tx in transactions:
        pos = str(tx.candidate_id)
        if pos in candidate_map:
            candidate_map[pos]["votes"] += 1

    # DB tally, kept separate from on-chain so the two can be compared for the
    # integrity check below (independent of the candidate_map display values).
    db_tally = {}
    for tx in transactions:
        pos = str(tx.candidate_id)
        db_tally[pos] = db_tally.get(pos, 0) + 1

    # Try to fetch on-chain results (more authoritative)
    integrity_verified = None  # None = could not check, True/False = checked
    blockchain_enabled = os.environ.get("BLOCKCHAIN_ENABLED", "false").lower() == "true"
    if blockchain_enabled and election.contract_address:
        try:
            on_chain_counts = _fetch_on_chain_results(election.contract_address)
            for position_str, count in on_chain_counts.items():
                if position_str in candidate_map:
                    candidate_map[position_str]["votes"] = count
            integrity_verified = (on_chain_counts == db_tally)
        except Exception:
            pass  # fall back to DB counts silently; integrity stays unverifiable

    # Build per-constituency result groups
    result_constituencies = []
    total_votes = 0
    for group in constituency_order:
        c_total = sum(cand["votes"] for cand in group["candidates"])
        total_votes += c_total
        result_constituencies.append({
            "constituency_id": group["constituency_id"],
            "constituency_name": group["constituency_name"],
            "candidates": group["candidates"],
            "total_votes": c_total,
        })

    # Flat candidate list for backward-compat
    all_candidates = [info for group in constituency_order for info in group["candidates"]]

    return jsonify({
        "election_id": election.election_id,
        "title": election.title,
        "status": election.status,
        "is_live": is_live,
        "contract_address": election.contract_address,
        "constituencies": result_constituencies,
        "candidates": all_candidates,
        "transactions": [
            {
                "blockchain_tx_hash": tx.blockchain_tx_hash,
                "wallet_address": tx.wallet_address,
                "timestamp": tx.timestamp.isoformat(),
            }
            for tx in transactions
        ],
        "total_votes": total_votes,
        "integrity_verified": integrity_verified,
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
        "../../../artifacts/contracts/EVoting.sol/EVoting.json"
    )
    with open(artifact_path) as f:
        artifact = _json.load(f)
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    contract = w3.eth.contract(address=contract_address, abi=artifact["abi"])
    ids, counts = contract.functions.getResults().call()
    return {str(int(ids[i])): int(counts[i]) for i in range(len(ids))}
