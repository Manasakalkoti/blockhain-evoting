from flask import Blueprint, request, jsonify
from app import db
from app.models.election import Election
from app.models.constituency import Constituency
from app.models.candidate import Candidate
from app.api.middleware import require_admin

candidates_bp = Blueprint("candidates", __name__)


@candidates_bp.route("/api/elections/<election_id>/candidates", methods=["POST"])
@require_admin
def add_candidate(election_id):
    election = Election.query.get_or_404(election_id)
    if election.candidates_locked:
        return jsonify({"message": "Candidates are locked"}), 400
    if election.status != "draft":
        return jsonify({"message": "Cannot modify candidates after election is locked"}), 400

    data = request.get_json(silent=True) or {}
    candidate_name = (data.get("candidate_name") or "").strip()
    if not candidate_name:
        return jsonify({"message": "candidate_name is required"}), 400

    party_name = (data.get("party_name") or "").strip() or None
    constituency_id = data.get("constituency_id")

    if constituency_id:
        constituency = Constituency.query.filter_by(
            constituency_id=constituency_id, election_id=election_id
        ).first_or_404()
    else:
        constituency = election.constituencies.first()
        if not constituency:
            return jsonify({"message": "No constituency found for this election"}), 400

    # Next display position
    max_pos = (
        db.session.query(db.func.max(Candidate.candidate_position))
        .filter_by(constituency_id=constituency.constituency_id)
        .scalar()
        or 0
    )

    candidate = Candidate(
        constituency_id=constituency.constituency_id,
        candidate_name=candidate_name,
        party_name=party_name,
        candidate_position=max_pos + 1,
    )
    db.session.add(candidate)
    db.session.commit()

    return jsonify({
        "candidate": {
            "candidate_id": candidate.candidate_id,
            "candidate_name": candidate.candidate_name,
            "party_name": candidate.party_name,
            "candidate_position": candidate.candidate_position,
            "constituency_id": candidate.constituency_id,
            "status": candidate.status,
        }
    }), 201


@candidates_bp.route(
    "/api/elections/<election_id>/candidates/<candidate_id>", methods=["DELETE"]
)
@require_admin
def remove_candidate(election_id, candidate_id):
    election = Election.query.get_or_404(election_id)
    if election.candidates_locked:
        return jsonify({"message": "Candidates are locked"}), 400
    if election.status != "draft":
        return jsonify({"message": "Cannot modify candidates after election is locked"}), 400

    candidate = Candidate.query.get_or_404(candidate_id)
    if candidate.constituency.election_id != election_id:
        return jsonify({"message": "Candidate not found in this election"}), 404

    db.session.delete(candidate)
    db.session.commit()
    return jsonify({"message": "Candidate removed"})
