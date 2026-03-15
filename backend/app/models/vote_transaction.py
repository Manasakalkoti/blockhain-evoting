import uuid
from datetime import datetime
from app import db


class VoteTransaction(db.Model):
    """
    Written by POST /api/votes/record after the frontend confirms an on-chain vote TX.
    The backend verifies the TX exists on-chain before inserting here.
    """
    __tablename__ = "vote_transactions"

    transaction_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    election_id = db.Column(db.String(36), db.ForeignKey("elections.election_id"), nullable=False)
    voter_id = db.Column(db.String(36), db.ForeignKey("users.user_id"), nullable=False)
    wallet_address = db.Column(db.String(42), nullable=False)
    candidate_id = db.Column(db.String(36), nullable=False)         # not FK — contract is source of truth
    blockchain_tx_hash = db.Column(db.String(66), unique=True, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    election = db.relationship("Election", back_populates="vote_transactions")
    voter = db.relationship("User", back_populates="vote_transactions")

    def __repr__(self):
        return f"<VoteTransaction {self.blockchain_tx_hash[:12]}...>"
