import uuid
from datetime import datetime
from app import db


class User(db.Model):
    __tablename__ = "users"

    user_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255))
    phone_number = db.Column(db.String(20))
    aadhaar_hash = db.Column(db.String(255))
    firebase_uid = db.Column(db.String(128), unique=True)
    role = db.Column(db.Enum("admin", "voter"), nullable=False, default="voter")
    wallet_address = db.Column(db.String(42))
    
    # Organization link
    organization_id = db.Column(db.String(36), db.ForeignKey("organizations.organization_id"), nullable=True)
    student_id = db.Column(db.String(100))
    employee_id = db.Column(db.String(100))

    # Address fields
    address_line = db.Column(db.String(500))
    city = db.Column(db.String(100))
    state = db.Column(db.String(100))
    pincode = db.Column(db.String(10))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)

    status = db.Column(db.Enum("active", "suspended"), default="active", nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    organization = db.relationship("Organization", back_populates="users")
    created_elections = db.relationship("Election", back_populates="created_by", lazy="dynamic")
    voter_verifications = db.relationship("VoterVerification", back_populates="user", lazy="dynamic")
    vote_transactions = db.relationship("VoteTransaction", back_populates="voter", lazy="dynamic")

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"
