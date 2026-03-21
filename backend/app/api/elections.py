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
        "party_name": c.party_name,
        "candidate_position": c.candidate_position,
        "constituency_id": c.constituency_id,
        "status": c.status,
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

    return {
        **_election_summary(election),
        "eligibility_merkle_root": election.eligibility_merkle_root,
        "contract_deployed_at": (
            election.contract_deployed_at.isoformat()
            if election.contract_deployed_at
            else None
        ),
        "candidates": candidates,
        "voter_count": voter_count,
        "default_constituency_id": default_constituency_id,
    }


# ── List ──────────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections", methods=["GET"])
@require_admin
def list_elections():
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

    election = Election(
        title=title,
        description=description,
        election_type=election_type,
        visibility_type=visibility_type,
        start_time=start_time,
        end_time=end_time,
        created_by_admin=g.user_id,
        status="draft",
    )
    db.session.add(election)
    db.session.flush()  # get election_id before commit

    # Auto-create one default constituency
    constituency = Constituency(
        election_id=election.election_id,
        constituency_name="General",
        description="Default constituency",
    )
    db.session.add(constituency)
    db.session.commit()

    return jsonify({"election": _election_detail(election)}), 201


# ── Detail ────────────────────────────────────────────────────────────────────

@elections_bp.route("/api/elections/<election_id>", methods=["GET"])
@require_admin
def get_election(election_id):
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


# ── Lock (triggers Merkle + contract deploy pipeline) ─────────────────────────

@elections_bp.route("/api/elections/<election_id>/lock", methods=["POST"])
@require_admin
def lock_election(election_id):
    from app import extensions
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

    q = extensions.get_queue("default")
    job = q.enqueue(lock_election_pipeline, election_id, job_timeout=300)
    extensions.redis_client.set(f"job:lock:{election_id}", job.id, ex=3600)

    return jsonify({"job_id": job.id, "status": "queued"})


# ── End Election (calls endElection on contract) ──────────────────────────────

@elections_bp.route("/api/elections/<election_id>/end", methods=["POST"])
@require_admin
def end_election_route(election_id):
    from app import extensions
    from app.jobs.merkle_jobs import end_election_job

    election = Election.query.get_or_404(election_id)
    if election.status not in ("active", "scheduled"):
        return jsonify({"message": "Election must be active or scheduled to end"}), 400

    q = extensions.get_queue("default")
    job = q.enqueue(end_election_job, election_id, job_timeout=120)
    extensions.redis_client.set(f"job:end:{election_id}", job.id, ex=3600)

    return jsonify({"job_id": job.id, "status": "queued"})


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
        status = str(job.get_status())
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
