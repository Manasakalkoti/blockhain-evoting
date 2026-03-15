from flask import Blueprint, jsonify, render_template
from app import extensions

health_bp = Blueprint("health", __name__)


@health_bp.route("/")
def index():
    return render_template("index.html")


@health_bp.route("/voting/")
def voting():
    return render_template("voting.html")


@health_bp.route("/api/health")
def health():
    redis_ok = False
    if extensions.redis_client is not None:
        try:
            extensions.redis_client.ping()
            redis_ok = True
        except Exception:
            pass

    status = "ok" if redis_ok else "degraded"
    code = 200 if redis_ok else 503

    return jsonify({
        "status": status,
        "service": "blockchain-evoting-api",
        "redis": "ok" if redis_ok else "unavailable",
    }), code
