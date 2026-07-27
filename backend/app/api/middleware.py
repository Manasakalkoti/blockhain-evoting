from functools import wraps
from flask import request, jsonify, g
from jose import jwt, JWTError
import os

JWT_SECRET = os.getenv("SECRET_KEY", "dev-secret")
JWT_ALGORITHM = "HS256"


def _extract_payload():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, (jsonify({"message": "Missing or invalid Authorization header"}), 401)
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload, None
    except JWTError:
        return None, (jsonify({"message": "Invalid or expired token"}), 401)


def require_jwt(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload, err = _extract_payload()
        if err:
            return err
        g.user_id = payload["sub"]
        g.role = payload["role"]
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload, err = _extract_payload()
        if err:
            return err
        if payload.get("role") not in ("admin", "super_admin"):
            return jsonify({"message": "Admin access required"}), 403
        g.user_id = payload["sub"]
        g.role = payload["role"]
        return f(*args, **kwargs)
    return decorated


def require_super_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload, err = _extract_payload()
        if err:
            return err
        if payload.get("role") != "super_admin":
            return jsonify({"message": "Organisation owner access required"}), 403
        g.user_id = payload["sub"]
        g.role = payload["role"]
        return f(*args, **kwargs)
    return decorated
