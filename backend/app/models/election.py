import uuid
from datetime import datetime
from app import db


class Election(db.Model):
    __tablename__ = "elections"

    election_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    election_type = db.Column(db.Enum("single_seat", "multi_seat"), nullable=False)
    visibility_type = db.Column(db.Enum("private", "public"), nullable=False)

    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)

    # Blockchain / eligibility fields
    eligibility_merkle_root = db.Column(db.String(66))   # bytes32 hex
    location_rule_hash = db.Column(db.String(66))
    location_rules = db.Column(db.Text)                  # JSON: districts/wards/pincodes for public elections
    eligibility_locked = db.Column(db.Boolean, default=False, nullable=False)
    candidates_locked = db.Column(db.Boolean, default=False, nullable=False)
    candidate_list_hash = db.Column(db.String(66))

    # Merkle tree JSON — full tree stored for on-demand proof generation
    merkle_tree_json = db.Column(db.Text)

    # Contract info (filled after deployment)
    contract_address = db.Column(db.String(42))
    contract_deployed_at = db.Column(db.DateTime)

    # Admin who created this election
    created_by_admin = db.Column(db.String(36), db.ForeignKey("users.user_id"), nullable=False)

    status = db.Column(
        db.Enum("draft", "scheduled", "active", "completed"),
        default="draft",
        nullable=False,
    )
    results_published = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    created_by = db.relationship("User", back_populates="created_elections")
    constituencies = db.relationship("Constituency", back_populates="election", lazy="dynamic", cascade="all, delete-orphan")
    voter_verifications = db.relationship("VoterVerification", back_populates="election", lazy="dynamic")
    vote_transactions = db.relationship("VoteTransaction", back_populates="election", lazy="dynamic")

    def __repr__(self):
        return f"<Election {self.title} [{self.status}]>"
