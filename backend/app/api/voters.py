from flask import Blueprint, request, jsonify
from app import db
from app.models.election import Election
from app.models.election_voter import ElectionVoter
from app.api.middleware import require_admin

voters_bp = Blueprint("voters", __name__)


@voters_bp.route("/api/elections/<election_id>/voters/upload", methods=["POST"])
@require_admin
def upload_voters(election_id):
    from app.jobs.csv_jobs import process_csv_upload

    election = Election.query.get_or_404(election_id)
    if election.status != "draft":
        return jsonify({"message": "Election is not in draft status"}), 400
    if election.eligibility_locked:
        return jsonify({"message": "Voter eligibility is already locked"}), 400
    if election.visibility_type != "private":
        return jsonify({"message": "CSV upload is only for private elections"}), 400

    if "file" not in request.files:
        return jsonify({"message": "No file uploaded"}), 400

    f = request.files["file"]
    if not f.filename.lower().endswith(".csv"):
        return jsonify({"message": "File must be a .csv"}), 400

    csv_content = f.read().decode("utf-8", errors="replace")
    if not csv_content.strip():
        return jsonify({"message": "CSV file is empty"}), 400

    constituency = election.constituencies.first()
    if not constituency:
        return jsonify({"message": "No constituency found for this election"}), 400

    # Run directly — RQ worker crashes on macOS (signal 6/SIGABRT)
    try:
        result = process_csv_upload(election_id, constituency.constituency_id, csv_content)
        return jsonify({"status": "finished", "result": result})
    except Exception as exc:
        return jsonify({"status": "failed", "error": str(exc)}), 500


@voters_bp.route("/api/elections/<election_id>/voters", methods=["DELETE"])
@require_admin
def clear_voters(election_id):
    """Remove all uploaded voter IDs so a new CSV can be uploaded."""
    election = Election.query.get_or_404(election_id)
    if election.status != "draft":
        return jsonify({"message": "Can only clear voters on a draft election"}), 400
    if election.eligibility_locked:
        return jsonify({"message": "Voter eligibility is already locked"}), 400

    constituency = election.constituencies.first()
    if not constituency:
        return jsonify({"message": "No constituency found"}), 400

    deleted = ElectionVoter.query.filter_by(
        constituency_id=constituency.constituency_id
    ).delete()
    db.session.commit()
    return jsonify({"message": f"Cleared {deleted} voter records"})
