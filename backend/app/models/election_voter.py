import uuid
from datetime import datetime
from app import db


class ElectionVoter(db.Model):
    """
    Eligible voter list for a constituency (populated via CSV upload).
    voter_identifier: raw ID from the uploaded CSV (e.g. USN, roll number).
    hashed_identifier: keccak256 / bcrypt hash used for Merkle tree leaves.
    """
    __tablename__ = "election_voters"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    constituency_id = db.Column(db.String(36), db.ForeignKey("constituencies.constituency_id"), nullable=False)
    voter_identifier = db.Column(db.String(255), nullable=False)    # raw CSV value
    hashed_identifier = db.Column(db.String(255), nullable=False)   # Merkle leaf
    authorization_status = db.Column(
        db.Enum("authorized"),
        default="authorized",
        nullable=False,
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    constituency = db.relationship("Constituency", back_populates="election_voters")

    def __repr__(self):
        return f"<ElectionVoter {self.voter_identifier}>"
