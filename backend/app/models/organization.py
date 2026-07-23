import uuid
from datetime import datetime
from app import db


class Organization(db.Model):
    __tablename__ = "organizations"

    organization_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(100), nullable=False)
    verified = db.Column(db.Boolean, default=True, nullable=False)
    deleted = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    users = db.relationship("User", back_populates="organization", lazy="dynamic")

    def __repr__(self):
        return f"<Organization {self.name}>"
