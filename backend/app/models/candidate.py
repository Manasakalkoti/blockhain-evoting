import uuid
from datetime import datetime
from app import db


class Candidate(db.Model):
    __tablename__ = "candidates"

    candidate_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    constituency_id = db.Column(db.String(36), db.ForeignKey("constituencies.constituency_id"), nullable=False)
    candidate_name = db.Column(db.String(255), nullable=False)
    candidate_identifier = db.Column(db.String(100))   # USN / Employee ID for validation
    party_name = db.Column(db.String(255))
    symbol_url = db.Column(db.String(500))
    profile_photo = db.Column(db.String(500))
    manifesto = db.Column(db.Text)
    candidate_position = db.Column(db.Integer)          # display order
    status = db.Column(
        db.Enum("active", "withdrawn", "disqualified"),
        default="active",
        nullable=False,
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    constituency = db.relationship("Constituency", back_populates="candidates")

    def __repr__(self):
        return f"<Candidate {self.candidate_name}>"
