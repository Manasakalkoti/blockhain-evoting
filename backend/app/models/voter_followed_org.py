import uuid
from datetime import datetime
from app import db


class VoterFollowedOrg(db.Model):
    __tablename__ = "voter_followed_orgs"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey("users.user_id"), nullable=False)
    organization_id = db.Column(db.String(36), db.ForeignKey("organizations.organization_id"), nullable=False)
    followed_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint("user_id", "organization_id"),)
