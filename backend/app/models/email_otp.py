import uuid
import random
import hashlib
from datetime import datetime, timedelta
from app import db


class EmailOtp(db.Model):
    __tablename__ = "email_otps"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), nullable=False, index=True)
    otp_hash = db.Column(db.String(64), nullable=False)
    purpose = db.Column(db.String(50), nullable=False)  # login | org_register | voter_register
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)
    failed_attempts = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    MAX_ATTEMPTS = 5

    @staticmethod
    def generate():
        return str(random.randint(100000, 999999))

    @staticmethod
    def hash_otp(otp):
        return hashlib.sha256(otp.encode()).hexdigest()

    @classmethod
    def create_for(cls, email, purpose):
        cls.query.filter_by(email=email.lower(), purpose=purpose, used=False).delete()
        otp = cls.generate()
        record = cls(
            email=email.lower(),
            otp_hash=cls.hash_otp(otp),
            purpose=purpose,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
        db.session.add(record)
        db.session.commit()
        return otp

    @property
    def is_locked(self) -> bool:
        return self.failed_attempts >= self.MAX_ATTEMPTS

    def verify(self, otp: str) -> bool:
        if self.used:
            return False
        if datetime.utcnow() > self.expires_at:
            return False
        if self.is_locked:
            return False
        if self.otp_hash == self.hash_otp(otp):
            return True
        # Wrong OTP — increment counter and save
        self.failed_attempts += 1
        db.session.commit()
        return False

    def consume(self):
        self.used = True
        db.session.commit()
