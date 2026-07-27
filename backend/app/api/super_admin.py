import bcrypt
from flask import Blueprint, request, jsonify, g
from app import db
from app.models.user import User
from app.models.organization import Organization
from app.models.election import Election
from app.api.middleware import require_super_admin

super_admin_bp = Blueprint("super_admin", __name__)


def _hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


# ── Organisation detail ───────────────────────────────────────────────────────

@super_admin_bp.route("/api/org/me", methods=["GET"])
@require_super_admin
def get_my_org():
    """Return the super admin's organisation details."""
    user = User.query.get_or_404(g.user_id)
    org = Organization.query.get_or_404(user.organization_id)

    from app.models.voter_followed_org import VoterFollowedOrg
    admins = User.query.filter_by(organization_id=org.organization_id, role="admin").all()
    elections = Election.query.filter_by(organization_id=org.organization_id).order_by(Election.created_at.desc()).all()

    follows = VoterFollowedOrg.query.filter_by(organization_id=org.organization_id).all()
    follower_ids = [f.user_id for f in follows]
    followers = User.query.filter(User.user_id.in_(follower_ids)).all() if follower_ids else []

    return jsonify({
        "organization": {
            "organization_id": org.organization_id,
            "name": org.name,
            "type": org.type,
            "verified": org.verified,
            "created_at": org.created_at.isoformat(),
            "follower_count": len(followers),
        },
        "admins": [
            {"user_id": a.user_id, "full_name": a.full_name, "email": a.email, "status": a.status}
            for a in admins
        ],
        "elections": [
            {
                "election_id": e.election_id,
                "title": e.title,
                "status": e.status,
                "start_time": e.start_time.isoformat(),
                "end_time": e.end_time.isoformat(),
            }
            for e in elections
        ],
        "followers": [
            {
                "user_id": f.user_id,
                "full_name": f.full_name,
                "email": f.email,
            }
            for f in followers
        ],
    })


# ── Create Admin ──────────────────────────────────────────────────────────────

@super_admin_bp.route("/api/org/admins", methods=["POST"])
@require_super_admin
def create_admin():
    """Super Admin creates an Admin account under their organisation."""
    user = User.query.get_or_404(g.user_id)
    data = request.get_json(silent=True) or {}

    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not full_name or not email or not password:
        return jsonify({"message": "full_name, email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    admin = User(
        full_name=full_name,
        email=email,
        password_hash=_hash_password(password),
        role="admin",
        organization_id=user.organization_id,
    )
    db.session.add(admin)
    db.session.commit()

    return jsonify({
        "message": "Admin created successfully",
        "admin": {
            "user_id": admin.user_id,
            "full_name": admin.full_name,
            "email": admin.email,
            "role": admin.role,
        }
    }), 201


# ── Delete Organisation (soft delete) ────────────────────────────────────────

@super_admin_bp.route("/api/org/me", methods=["DELETE"])
@require_super_admin
def delete_my_org():
    """
    Soft-delete the organisation:
    1. Block if any election is currently active
    2. Mark org as deleted — disappears from voter search
    3. Suspend all admins under the org
    4. Suspend the super admin themselves
    Historical elections + on-chain data are preserved for audit.
    """
    super_admin = User.query.get_or_404(g.user_id)
    org = Organization.query.get_or_404(super_admin.organization_id)

    # Block if any election is active
    active = Election.query.filter_by(
        organization_id=org.organization_id, status="active"
    ).first()
    if active:
        return jsonify({
            "message": f"Cannot delete organisation while an election is active: '{active.title}'. "
                       f"Wait for it to end first."
        }), 400

    # Soft delete the org
    org.deleted = True

    # Suspend all members (admins) under this org
    User.query.filter(
        User.organization_id == org.organization_id,
        User.user_id != super_admin.user_id
    ).update({"status": "suspended"}, synchronize_session=False)

    # Suspend the super admin too
    super_admin.status = "suspended"

    db.session.commit()

    return jsonify({
        "message": "Organisation has been deleted. Your account has been suspended."
    })


# ── Remove member ─────────────────────────────────────────────────────────────

@super_admin_bp.route("/api/org/members/<user_id>", methods=["DELETE"])
@require_super_admin
def remove_member(user_id):
    """Super Admin removes an admin or RC member from their org."""
    owner = User.query.get_or_404(g.user_id)
    member = User.query.get_or_404(user_id)

    if member.organization_id != owner.organization_id:
        return jsonify({"message": "This member does not belong to your organisation"}), 403
    if member.role != "admin":
        return jsonify({"message": "Can only remove admins"}), 400

    db.session.delete(member)
    db.session.commit()
    return jsonify({"message": f"{member.full_name} removed from organisation"})
