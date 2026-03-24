import re
from flask import Blueprint, request, jsonify, g
from app import db
from app.models.user import User
import bcrypt
from jose import jwt
import os
import datetime
from app.api.middleware import require_jwt

auth_bp = Blueprint("auth", __name__)

JWT_SECRET = os.getenv("SECRET_KEY", "dev-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


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
    }


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not full_name or not email or not password:
        return jsonify({"message": "full_name, email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    user = User(
        full_name=full_name,
        email=email,
        password_hash=_hash_password(password),
        role="voter",
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.password_hash or not _check_password(password, user.password_hash):
        return jsonify({"message": "Invalid email or password"}), 401

    if user.status == "suspended":
        return jsonify({"message": "Account suspended"}), 403

    return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 200


@auth_bp.route("/api/auth/wallet", methods=["PUT"])
@require_jwt
def link_wallet():
    """
    Link a MetaMask wallet address to the authenticated voter's account.
    The wallet address is required for Merkle proof generation in private elections.

    Body: { "wallet_address": "0x..." }
    """
    data = request.get_json(silent=True) or {}
    wallet = (data.get("wallet_address") or "").strip().lower()

    if not wallet:
        return jsonify({"message": "wallet_address is required"}), 400

    # Basic Ethereum address validation: 0x + 40 hex chars
    if not re.match(r'^0x[0-9a-f]{40}$', wallet):
        return jsonify({"message": "Invalid Ethereum wallet address"}), 400

    # Check that no other user owns this wallet
    existing = User.query.filter(
        User.wallet_address == wallet,
        User.user_id != g.user_id
    ).first()
    if existing:
        return jsonify({"message": "This wallet address is already linked to another account"}), 409

    user = User.query.get_or_404(g.user_id)
    user.wallet_address = wallet
    db.session.commit()

    return jsonify({
        "message": "Wallet address linked successfully",
        "wallet_address": wallet,
    })


@auth_bp.route("/api/auth/profile", methods=["GET"])
@require_jwt
def get_profile():
    """Return the authenticated user's profile including wallet address."""
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
    """Update voter profile fields (address, student_id, etc.)."""
    user = User.query.get_or_404(g.user_id)
    data = request.get_json(silent=True) or {}

    updatable = ["full_name", "phone_number", "student_id", "employee_id",
                 "address_line", "city", "state", "pincode"]
    for field in updatable:
        if field in data:
            setattr(user, field, (data[field] or "").strip() or None)

    db.session.commit()
    return jsonify({"user": _user_dict(user)})


@auth_bp.route("/api/auth/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email, role="admin").first()
    if not user or not user.password_hash or not _check_password(password, user.password_hash):
        return jsonify({"message": "Invalid credentials"}), 401

    if user.status == "suspended":
        return jsonify({"message": "Account suspended"}), 403

    return jsonify({"token": _make_jwt(user), "user": _user_dict(user)}), 200
