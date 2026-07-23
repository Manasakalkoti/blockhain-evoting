import re
from flask import Blueprint, request, jsonify, g
from app import db
from app.models.user import User
from app.models.email_otp import EmailOtp
import bcrypt
from jose import jwt
import os
import datetime
from app.api.middleware import require_jwt

auth_bp = Blueprint("auth", __name__)

JWT_SECRET = os.getenv("SECRET_KEY", "dev-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

SIM_KEY = os.getenv("SIM_KEY", "")

def _is_sim_request():
    """Dev-only: skip OTP when simulation script sends the correct key."""
    if os.getenv("FLASK_ENV") != "development":
        return False
    key = request.headers.get("X-Sim-Key", "")
    return bool(SIM_KEY and key == SIM_KEY)


def _hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check_password(password, hashed):
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _make_jwt(user):
    payload = {
        "sub": user.user_id,
        "role": user.role,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _user_dict(user):
    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "wallet_address": user.wallet_address,
        "organization_id": user.organization_id,
    }


# ── Voter Registration (2-step with OTP) ──────────────────────────────────────

@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    """Step 1 — validate details and send OTP to voter's email."""
    from app.services.email_service import send_otp_email
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not full_name or not email or not password:
        return jsonify({"message": "full_name, email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400

    existing = User.query.filter_by(email=email).first()
    if existing:
        # Sim: return token for already-registered sim voter
        if _is_sim_request():
            return jsonify({"token": _make_jwt(existing), "user": _user_dict(existing)}), 200
        return jsonify({"message": "Email already registered"}), 409

    # Sim bypass: create voter directly without OTP
    if _is_sim_request():
        user = User(full_name=full_name, email=email,
                    password_hash=_hash_password(password), role="voter")
        db.session.add(user)
        db.session.commit()
        return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 201

    otp = EmailOtp.create_for(email, "voter_register")
    send_otp_email(email, otp, "voter_register")
    return jsonify({"step": "otp", "message": f"OTP sent to {email}"}), 200


@auth_bp.route("/api/auth/register/verify", methods=["POST"])
def register_verify():
    """Step 2 — verify OTP and create voter account."""
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    otp = (data.get("otp") or "").strip()

    if not all([full_name, email, password, otp]):
        return jsonify({"message": "full_name, email, password and otp are required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    record = EmailOtp.query.filter_by(
        email=email, purpose="voter_register", used=False
    ).order_by(EmailOtp.created_at.desc()).first()

    if not record or not record.verify(otp):
        return jsonify({"message": "Invalid or expired OTP"}), 400

    record.consume()

    user = User(
        full_name=full_name,
        email=email,
        password_hash=_hash_password(password),
        role="voter",
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 201


# ── Common Login — Step 1 (all roles) ─────────────────────────────────────────

@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """Step 1 — verify email+password, then send OTP."""
    from app.services.email_service import send_otp_email
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.password_hash or not _check_password(password, user.password_hash):
        return jsonify({"message": "Invalid email or password"}), 401
    if user.status == "suspended":
        return jsonify({"message": "Account suspended"}), 403

    # Sim bypass: return token directly without OTP
    if _is_sim_request():
        return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 200

    otp = EmailOtp.create_for(email, "login")
    send_otp_email(email, otp, "login")
    return jsonify({"step": "otp", "message": f"OTP sent to {email}"}), 200


# ── Common Login — Step 2 (OTP verify, all roles) ────────────────────────────

@auth_bp.route("/api/auth/verify-otp", methods=["POST"])
def verify_login_otp():
    """Step 2 — verify OTP and return JWT."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()

    if not email or not otp:
        return jsonify({"message": "email and otp are required"}), 400

    record = EmailOtp.query.filter_by(
        email=email, purpose="login", used=False
    ).order_by(EmailOtp.created_at.desc()).first()

    if not record or not record.verify(otp):
        return jsonify({"message": "Invalid or expired OTP"}), 400

    record.consume()

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"message": "User not found"}), 404

    return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 200


# ── Organisation Registration — Step 1 ────────────────────────────────────────

@auth_bp.route("/api/auth/org/register", methods=["POST"])
def org_register():
    """Step 1 — validate org details, check institutional email, send OTP."""
    from app.services.email_service import send_otp_email, is_institutional_email
    data = request.get_json(silent=True) or {}
    org_name = (data.get("org_name") or "").strip()
    org_type = (data.get("org_type") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not all([org_name, org_type, full_name, email, password]):
        return jsonify({"message": "org_name, org_type, full_name, email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400
    if not is_institutional_email(email):
        return jsonify({
            "message": "Organisation registration requires an institutional email (e.g. .ac.in, .edu, .org)"
        }), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    otp = EmailOtp.create_for(email, "org_register")
    send_otp_email(email, otp, "org_register")
    return jsonify({"step": "otp", "message": f"OTP sent to {email}"}), 200


# ── Organisation Registration — Step 2 ────────────────────────────────────────

@auth_bp.route("/api/auth/org/register/verify", methods=["POST"])
def org_register_verify():
    """Step 2 — verify OTP, create organisation and super_admin user."""
    from app.models.organization import Organization
    data = request.get_json(silent=True) or {}
    org_name = (data.get("org_name") or "").strip()
    org_type = (data.get("org_type") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    otp = (data.get("otp") or "").strip()

    if not all([org_name, org_type, full_name, email, password, otp]):
        return jsonify({"message": "All fields including otp are required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    record = EmailOtp.query.filter_by(
        email=email, purpose="org_register", used=False
    ).order_by(EmailOtp.created_at.desc()).first()

    if not record or not record.verify(otp):
        return jsonify({"message": "Invalid or expired OTP"}), 400

    record.consume()

    org = Organization(name=org_name, type=org_type, verified=True)
    db.session.add(org)
    db.session.flush()

    user = User(
        full_name=full_name,
        email=email,
        password_hash=_hash_password(password),
        role="super_admin",
        organization_id=org.organization_id,
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 201


# ── Wallet & Profile ───────────────────────────────────────────────────────────

@auth_bp.route("/api/auth/wallet", methods=["PUT"])
@require_jwt
def link_wallet():
    data = request.get_json(silent=True) or {}
    wallet = (data.get("wallet_address") or "").strip().lower()

    if not wallet:
        return jsonify({"message": "wallet_address is required"}), 400
    if not re.match(r'^0x[0-9a-f]{40}$', wallet):
        return jsonify({"message": "Invalid Ethereum wallet address"}), 400

    existing = User.query.filter(
        User.wallet_address == wallet,
        User.user_id != g.user_id
    ).first()
    if existing:
        return jsonify({"message": "This wallet address is already linked to another account"}), 409

    user = User.query.get_or_404(g.user_id)
    user.wallet_address = wallet
    db.session.commit()
    return jsonify({"message": "Wallet address linked successfully", "wallet_address": wallet})


@auth_bp.route("/api/auth/profile", methods=["GET"])
@require_jwt
def get_profile():
    user = User.query.get_or_404(g.user_id)
    return jsonify({
        "user": {
            **_user_dict(user),
            "student_id": user.student_id,
            "employee_id": user.employee_id,
            "phone_number": user.phone_number,
            "address_line": user.address_line,
            "city": user.city,
            "state": user.state,
            "pincode": user.pincode,
        }
    })


@auth_bp.route("/api/auth/profile", methods=["PUT"])
@require_jwt
def update_profile():
    user = User.query.get_or_404(g.user_id)
    data = request.get_json(silent=True) or {}
    updatable = ["full_name", "phone_number", "student_id", "employee_id",
                 "address_line", "city", "state", "pincode"]
    for field in updatable:
        if field in data:
            setattr(user, field, (data[field] or "").strip() or None)
    db.session.commit()
    return jsonify({"user": _user_dict(user)})
