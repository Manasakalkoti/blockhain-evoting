from app import db
import uuid
from datetime import datetime


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    role = db.Column(db.Enum("admin", "voter"), nullable=False, default="voter")
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255))
    phone = db.Column(db.String(20))
    aadhaar_hash = db.Column(db.String(255))
    wallet_address = db.Column(db.String(42))
    status = db.Column(db.Enum("active", "suspended"), default="active")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"
