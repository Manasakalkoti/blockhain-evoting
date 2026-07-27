import uuid
from datetime import datetime
from app import db


class VoterVerification(db.Model):
    """
    Records the result of a voter's eligibility pre-verification for an election.
    Created by POST /api/elections/:id/verify before the voter can cast a vote.
    """
    __tablename__ = "voter_verifications"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey("users.user_id"), nullable=False)
    election_id = db.Column(db.String(36), db.ForeignKey("elections.election_id"), nullable=False)
    method = db.Column(
        db.Enum("id_verification", "address_verification"),
        nullable=False,
    )
    verified = db.Column(db.Boolean, default=False, nullable=False)
    verified_at = db.Column(db.DateTime)
    aadhaar_hash = db.Column(db.String(64), nullable=True)
    constituency_id = db.Column(db.String(36), db.ForeignKey("constituencies.constituency_id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship("User", back_populates="voter_verifications")
    election = db.relationship("Election", back_populates="voter_verifications")
    constituency = db.relationship("Constituency", backref="voter_verifications")

    def __repr__(self):
        return f"<VoterVerification user={self.user_id} election={self.election_id} verified={self.verified}>"
