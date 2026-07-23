import hashlib
import json

from flask import Blueprint, request, jsonify, g
from app import db
from app.models.election import Election
from app.models.constituency import Constituency
from app.models.candidate import Candidate
from app.api.middleware import require_admin
from datetime import datetime

elections_bp = Blueprint("elections", __name__)


def _candidate_dict(c):
    return {
        "candidate_id": c.candidate_id,
        "candidate_name": c.candidate_name,
        "candidate_identifier": c.candidate_identifier,
        "party_name": c.party_name,
        "symbol_url": c.symbol_url,       # used as text symbol (e.g. "🌹", "Hand")
        "manifesto": c.manifesto,
        "candidate_position": c.candidate_position,
        "constituency_id": c.constituency_id,
        "constituency_name": c.constituency.constituency_name if c.constituency else None,
        "status": c.status,
    }


def _constituency_dict(c):
    return {
        "constituency_id": c.constituency_id,
        "constituency_name": c.constituency_name,
        "description": c.description,
    }


def _election_summary(e):
    return {
        "election_id": e.election_id,
        "title": e.title,
        "description": e.description,
        "election_type": e.election_type,
        "visibility_type": e.visibility_type,
        "start_time": e.start_time.isoformat(),
        "end_time": e.end_time.isoformat(),
        "status": e.status,
        "eligibility_locked": e.eligibility_locked,
        "candidates_locked": e.candidates_locked,
        "contract_address": e.contract_address,
        "results_published": e.results_published,
        "created_at": e.created_at.isoformat(),
    }


def _election_detail(election):
    constituencies = election.constituencies.all()
    candidates = []
    voter_count = 0
    default_constituency_id = None

    for c in constituencies:
        if default_constituency_id is None:
            default_constituency_id = c.constituency_id
        for cand in (
            c.candidates.filter_by(status="active")
            .order_by(Candidate.candidate_position)
            .all()
        ):
            candidates.append(_candidate_dict(cand))
        voter_count += c.election_voters.count()

    location_rules = None
    if election.location_rules:
        try:
            location_rules = json.loads(election.location_rules)
        except (ValueError, TypeError):
            location_rules = None

    return {
        **_election_summary(election),
        "eligibility_merkle_root": election.eligibility_merkle_root,
        "location_rule_hash": election.location_rule_hash,
        "location_rules": location_rules,
        "contract_deployed_at": (
            election.contract_deployed_at.isoformat()
            if election.contract_deployed_at
            else None
        ),
        "candidates": candidates,
        "constituencies": [_constituency_dict(c) for c in constituencies],
        "voter_count": voter_count,
        "default_constituency_id": default_constituency_id,
    }


# ── List ──────────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections", methods=["GET"])
@require_admin
def list_elections():
    from app.api.voter_elections import _auto_transition_elections
    _auto_transition_elections()
    elections = Election.query.order_by(Election.created_at.desc()).all()
    return jsonify({"elections": [_election_summary(e) for e in elections]})


# ── Create ────────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections", methods=["POST"])
@require_admin
def create_election():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    election_type = data.get("election_type", "single_seat")
    visibility_type = data.get("visibility_type", "private")
    start_time_str = data.get("start_time")
    end_time_str = data.get("end_time")

    if not title:
        return jsonify({"message": "title is required"}), 400
    if election_type not in ("single_seat", "multi_seat"):
        return jsonify({"message": "Invalid election_type"}), 400
    if visibility_type not in ("private", "public"):
        return jsonify({"message": "Invalid visibility_type"}), 400

    try:
        start_time = datetime.fromisoformat(start_time_str)
        end_time = datetime.fromisoformat(end_time_str)
    except (TypeError, ValueError):
        return jsonify({"message": "start_time and end_time must be ISO datetime strings"}), 400

    if end_time <= start_time:
        return jsonify({"message": "end_time must be after start_time"}), 400

    from app.models.user import User
    creator = User.query.get(g.user_id)
    org_id = creator.organization_id if creator else None

    election = Election(
        title=title,
        description=description,
        election_type=election_type,
        visibility_type=visibility_type,
        start_time=start_time,
        end_time=end_time,
        created_by_admin=g.user_id,
        organization_id=org_id,
        status="draft",
    )
    db.session.add(election)
    db.session.flush()  # get election_id before commit

    # Auto-create one default constituency (named "General" for private, title for public)
    default_name = "General" if visibility_type == "private" else title
    constituency = Constituency(
        election_id=election.election_id,
        constituency_name=default_name,
        description="Default constituency",
    )
    db.session.add(constituency)
    db.session.commit()

    return jsonify({"election": _election_detail(election)}), 201


# ── Detail ────────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>", methods=["GET"])
@require_admin
def get_election(election_id):
    from app.api.voter_elections import _auto_transition_elections
    _auto_transition_elections()
    election = Election.query.get_or_404(election_id)
    return jsonify({"election": _election_detail(election)})


# ── Update ────────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>", methods=["PUT"])
@require_admin
def update_election(election_id):
    election = Election.query.get_or_404(election_id)
    if election.status != "draft":
        return jsonify({"message": "Only draft elections can be edited"}), 400

    data = request.get_json(silent=True) or {}
    if "title" in data:
        election.title = (data["title"] or "").strip()
    if "description" in data:
        election.description = (data["description"] or "").strip()
    if "start_time" in data:
        try:
            election.start_time = datetime.fromisoformat(data["start_time"])
        except ValueError:
            return jsonify({"message": "Invalid start_time"}), 400
    if "end_time" in data:
        try:
            election.end_time = datetime.fromisoformat(data["end_time"])
        except ValueError:
            return jsonify({"message": "Invalid end_time"}), 400

    db.session.commit()
    return jsonify({"election": _election_detail(election)})


# ── Delete ────────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>", methods=["DELETE"])
@require_admin
def delete_election(election_id):
    election = Election.query.get_or_404(election_id)
    if election.status != "draft":
        return jsonify({"message": "Only draft elections can be deleted"}), 400
    db.session.delete(election)
    db.session.commit()
    return jsonify({"message": "Election deleted"})


# ── Geo-Eligibility Configuration (public elections) ─────────────────────────

@elections_bp.route("/api/elections/<election_id>/geo-eligibility", methods=["PUT"])
@require_admin
def save_geo_eligibility(election_id):
    """Save location-based eligibility rules and return a mock voter estimate."""
    election = Election.query.get_or_404(election_id)
    if election.status != "draft":
        return jsonify({"message": "Only draft elections can be configured"}), 400
    if election.visibility_type != "public":
        return jsonify({"message": "Only public elections support geo eligibility"}), 400
    if election.eligibility_locked:
        return jsonify({"message": "Eligibility is already locked"}), 400

    data = request.get_json(silent=True) or {}
    districts = [d.strip() for d in data.get("districts", []) if str(d).strip()]
    wards = [w.strip() for w in data.get("wards", []) if str(w).strip()]
    pincodes = [p.strip() for p in data.get("pincodes", []) if str(p).strip()]

    if not districts and not wards and not pincodes:
        return jsonify({"message": "At least one district, ward, or PIN code is required"}), 400

    rules = {"districts": districts, "wards": wards, "pincodes": pincodes}
    election.location_rules = json.dumps(rules)
    db.session.commit()

    # Mock estimate — GEO_MOCK=true means we skip real geocoding
    import os
    if os.environ.get("GEO_MOCK", "true").lower() == "true":
        # Return a plausible estimate based on the number of rules entered
        rule_count = len(districts) + len(wards) + len(pincodes)
        estimated_voters = rule_count * 150
    else:
        from app.models.user import User
        # Real implementation: count users whose pincode/city matches the rules
        estimated_voters = User.query.filter(
            User.pincode.in_(pincodes) if pincodes else db.false()
        ).count()

    return jsonify({
        "location_rules": rules,
        "estimated_voters": estimated_voters,
        "message": "Geographic eligibility rules saved successfully",
    })


@elections_bp.route("/api/elections/<election_id>/geo-eligibility/lock", methods=["POST"])
@require_admin
def lock_geo_eligibility(election_id):
    """Lock the geographic eligibility rules — generates a tamper-proof hash."""
    election = Election.query.get_or_404(election_id)
    if election.visibility_type != "public":
        return jsonify({"message": "Only public elections support geo eligibility"}), 400
    if election.eligibility_locked:
        return jsonify({"message": "Eligibility is already locked"}), 400
    if not election.location_rules:
        return jsonify({"message": "Configure geographic eligibility rules first"}), 400

    rules_hash = "0x" + hashlib.sha256(election.location_rules.encode()).hexdigest()
    election.location_rule_hash = rules_hash
    election.eligibility_locked = True
    db.session.commit()

    return jsonify({
        "location_rule_hash": rules_hash,
        "locked": True,
        "message": "Location-based eligibility locked successfully",
    })


# ── Constituency Management ───────────────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>/constituencies", methods=["GET"])
@require_admin
def list_constituencies(election_id):
    election = Election.query.get_or_404(election_id)
    return jsonify({
        "constituencies": [_constituency_dict(c) for c in election.constituencies.all()]
    })


@elections_bp.route("/api/elections/<election_id>/constituencies", methods=["POST"])
@require_admin
def add_constituency(election_id):
    election = Election.query.get_or_404(election_id)
    if election.status != "draft":
        return jsonify({"message": "Only draft elections can be modified"}), 400

    data = request.get_json(silent=True) or {}
    name = (data.get("constituency_name") or "").strip()
    if not name:
        return jsonify({"message": "constituency_name is required"}), 400

    c = Constituency(
        election_id=election_id,
        constituency_name=name,
        description=(data.get("description") or "").strip() or None,
    )
    db.session.add(c)
    db.session.commit()
    return jsonify({"constituency": _constituency_dict(c)}), 201


# ── Lock (triggers Merkle + contract deploy pipeline) ─────────────────────────

@elections_bp.route("/api/elections/<election_id>/lock", methods=["POST"])
@require_admin
def lock_election(election_id):
    import os
    from app.jobs.merkle_jobs import lock_election_pipeline

    election = Election.query.get_or_404(election_id)
    if election.status != "draft":
        return jsonify({"message": "Election is not in draft status"}), 400

    constituencies = election.constituencies.all()
    total_candidates = sum(
        c.candidates.filter_by(status="active").count() for c in constituencies
    )
    if total_candidates == 0:
        return jsonify({"message": "Add at least one candidate before locking"}), 400

    if election.visibility_type == "private":
        total_voters = sum(c.election_voters.count() for c in constituencies)
        if total_voters == 0:
            return jsonify({"message": "Upload voter CSV before locking a private election"}), 400

    if election.visibility_type == "public" and not election.location_rules:
        return jsonify({"message": "Configure and lock geographic eligibility rules before locking a public election"}), 400

    # Always run directly — RQ worker crashes on macOS (signal 6/SIGABRT)
    # due to fork() + web3.py interaction. Direct execution is safe and fast enough.
    try:
        result = lock_election_pipeline(election_id)
        return jsonify({"status": "finished", "result": result})
    except Exception as exc:
        return jsonify({"status": "failed", "error": str(exc)}), 500


# ── End Election (calls endElection on contract) ──────────────────────────────

@elections_bp.route("/api/elections/<election_id>/end", methods=["POST"])
@require_admin
def end_election_route(election_id):
    import os
    from app.jobs.merkle_jobs import end_election_job

    election = Election.query.get_or_404(election_id)
    if election.status not in ("active", "scheduled"):
        return jsonify({"message": "Election must be active or scheduled to end"}), 400

    # Deployed elections end automatically at end_time — admin cannot force-end them
    if election.contract_address:
        return jsonify({"message": "This election is running on the blockchain. It will end automatically at its scheduled time."}), 403

    # Run directly — RQ worker crashes on macOS (signal 6/SIGABRT)
    try:
        result = end_election_job(election_id)
        return jsonify({"status": "finished", "result": result})
    except Exception as exc:
        return jsonify({"status": "failed", "error": str(exc)}), 500


# ── Redeploy (dev helper — clears stale contract after Hardhat restart) ───────

@elections_bp.route("/api/elections/<election_id>/redeploy", methods=["POST"])
@require_admin
def redeploy_election(election_id):
    """
    Clear the stale contract address so the election can be locked and deployed
    again. Useful in development when the Hardhat node is restarted and all
    previously deployed contracts are wiped.
    """
    from app.jobs.merkle_jobs import lock_election_pipeline
    import os

    election = Election.query.get_or_404(election_id)
    election.contract_address = None
    election.eligibility_locked = False
    election.candidates_locked = False
    election.status = "draft"
    db.session.commit()

    # Always run directly — no RQ worker needed for redeploy
    try:
        result = lock_election_pipeline(election_id)
        return jsonify({"status": "finished", "result": result})
    except Exception as exc:
        return jsonify({"status": "failed", "error": str(exc)}), 500


# ── Job status poll ───────────────────────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>/job-status", methods=["GET"])
@require_admin
def job_status(election_id):
    from rq.job import Job
    from app import extensions

    job_type = request.args.get("type", "lock")  # csv | lock | end
    raw = extensions.redis_client.get(f"job:{job_type}:{election_id}")
    if not raw:
        return jsonify({"status": "not_found"})

    job_id = raw.decode() if isinstance(raw, bytes) else raw
    try:
        job = Job.fetch(job_id, connection=extensions.redis_client)
        # RQ 2.x returns a JobStatus enum; use .value to get the plain string
        raw = job.get_status()
        status = raw.value if hasattr(raw, "value") else str(raw)
        resp = {"job_id": job_id, "status": status}
        if status == "finished":
            resp["result"] = job.result
        elif status == "failed":
            resp["error"] = str(job.exc_info) if job.exc_info else "Job failed"
        return jsonify(resp)
    except Exception as exc:
        return jsonify({"status": "not_found", "error": str(exc)})


# ── Voter list ────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>/voters", methods=["GET"])
@require_admin
def list_voters(election_id):
    from app.models.voter_verification import VoterVerification

    election = Election.query.get_or_404(election_id)
    constituencies = election.constituencies.all()

    # Build verified user_id set for this election
    verified_ids = {
        vv.user_id
        for vv in VoterVerification.query.filter_by(
            election_id=election_id, verified=True
        ).all()
    }

    voters = []
    for c in constituencies:
        for ev in c.election_voters.all():
            voters.append({
                "id": ev.id,
                "voter_identifier": ev.voter_identifier,
                "hashed_identifier": ev.hashed_identifier,
                "authorization_status": ev.authorization_status,
                "created_at": ev.created_at.isoformat(),
            })

    return jsonify({
        "voters": voters,
        "total": len(voters),
        "verified_count": len(verified_ids),
    })


# ── Audit (on-chain vs DB comparison) ─────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>/audit", methods=["GET"])
@require_admin
def audit_election(election_id):
    """
    Dual-source audit: compare on-chain vote tallies vs DB vote_transactions.
    Returns both counts for the Result Committee dashboard.
    """
    import os
    from app.models.vote_transaction import VoteTransaction

    election = Election.query.get_or_404(election_id)

    # DB tally
    db_transactions = VoteTransaction.query.filter_by(election_id=election_id).all()
    db_tally = {}
    for tx in db_transactions:
        cid = str(tx.candidate_id)
        db_tally[cid] = db_tally.get(cid, 0) + 1

    # On-chain tally (if available)
    on_chain_tally = None
    match = None
    blockchain_enabled = os.environ.get("BLOCKCHAIN_ENABLED", "false").lower() == "true"
    if blockchain_enabled and election.contract_address:
        try:
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
            contract = w3.eth.contract(address=election.contract_address, abi=artifact["abi"])
            ids, counts = contract.functions.getResults().call()
            on_chain_tally = {str(int(ids[i])): int(counts[i]) for i in range(len(ids))}
            match = (on_chain_tally == db_tally)
        except Exception as exc:
            on_chain_tally = {"error": str(exc)}
            match = None

    return jsonify({
        "election_id": election_id,
        "contract_address": election.contract_address,
        "db_tally": db_tally,
        "on_chain_tally": on_chain_tally,
        "match": match,
        "total_db_votes": len(db_transactions),
        "blockchain_enabled": blockchain_enabled,
    })
