"""
Votes blueprint — records on-chain vote transaction hashes submitted by the frontend.

POST /api/votes/confirm
  Called by the frontend AFTER MetaMask signs and broadcasts the vote transaction.
  The frontend provides the tx hash; the backend stores it for the audit trail.
  The blockchain is the source of truth — this record is for UX and auditability only.
"""
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from app import db
from app.models.election import Election
from app.models.vote_transaction import VoteTransaction
from app.models.voter_verification import VoterVerification
from app.api.middleware import require_jwt

votes_bp = Blueprint("votes", __name__)


@votes_bp.route("/api/votes/confirm", methods=["POST"])
@require_jwt
def confirm_vote():
    """
    Record a confirmed on-chain vote transaction.

    Body (JSON):
      election_id   - UUID of the election
      tx_hash       - 0x... transaction hash from the blockchain
      candidate_id  - candidate ID that was voted for
      wallet_address - voter's wallet address (must match g.user.wallet_address)
    """
    data = request.get_json(silent=True) or {}
    election_id    = (data.get("election_id") or "").strip()
    tx_hash        = (data.get("tx_hash") or "").strip().lower()
    candidate_id   = (data.get("candidate_id") or "")
    wallet_address = (data.get("wallet_address") or "").strip().lower()

    if not all([election_id, tx_hash, candidate_id, wallet_address]):
        return jsonify({"message": "election_id, tx_hash, candidate_id, and wallet_address are required"}), 400

    if not tx_hash.startswith("0x") or len(tx_hash) != 66:
        return jsonify({"message": "Invalid tx_hash format"}), 400

    # Verify election exists and is active
    election = Election.query.get(election_id)
    if not election:
        return jsonify({"message": "Election not found"}), 404
    if election.status != "active":
        return jsonify({"message": "Election is not currently active"}), 400

    # Verify voter was pre-verified for this election
    verification = VoterVerification.query.filter_by(
        election_id=election_id,
        user_id=g.user_id,
        verified=True,
    ).first()
    if not verification:
        return jsonify({"message": "Voter not verified for this election"}), 403

    # Prevent duplicate tx hash
    existing = VoteTransaction.query.filter_by(blockchain_tx_hash=tx_hash).first()
    if existing:
        return jsonify({"message": "Transaction hash already recorded"}), 409

    # Prevent double recording for same voter+election
    already_recorded = VoteTransaction.query.filter_by(
        election_id=election_id,
        voter_id=g.user_id,
    ).first()
    if already_recorded:
        return jsonify({
            "message": "Vote already recorded",
            "tx_hash": already_recorded.blockchain_tx_hash,
        }), 409

    vt = VoteTransaction(
        election_id=election_id,
        voter_id=g.user_id,
        wallet_address=wallet_address,
        candidate_id=str(candidate_id),
        blockchain_tx_hash=tx_hash,
        timestamp=datetime.utcnow(),
    )
    db.session.add(vt)
    db.session.commit()

    return jsonify({
        "success": True,
        "tx_hash": tx_hash,
        "message": "Vote transaction recorded",
    })
