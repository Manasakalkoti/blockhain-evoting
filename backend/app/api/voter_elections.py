import json
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from app import db
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_verification import VoterVerification
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
