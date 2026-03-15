import uuid
from datetime import datetime
from app import db


class Constituency(db.Model):
    __tablename__ = "constituencies"

    constituency_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    election_id = db.Column(db.String(36), db.ForeignKey("elections.election_id"), nullable=False)
    constituency_name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    election = db.relationship("Election", back_populates="constituencies")
    candidates = db.relationship("Candidate", back_populates="constituency", lazy="dynamic", cascade="all, delete-orphan")
    election_voters = db.relationship("ElectionVoter", back_populates="constituency", lazy="dynamic", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Constituency {self.constituency_name}>"
