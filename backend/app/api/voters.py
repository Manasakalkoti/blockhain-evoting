from flask import Blueprint, request, jsonify
from app.models.election import Election
from app.api.middleware import require_admin
from app import extensions

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

    q = extensions.get_queue("default")
    job = q.enqueue(
        process_csv_upload,
        election_id,
        constituency.constituency_id,
        csv_content,
        job_timeout=120,
    )
    extensions.redis_client.set(f"job:csv:{election_id}", job.id, ex=3600)

    return jsonify({"job_id": job.id, "status": "queued"})
