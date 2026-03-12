from flask import Blueprint, jsonify, render_template

health_bp = Blueprint("health", __name__)


@health_bp.route("/")
def index():
    return render_template("index.html")


@health_bp.route("/api/health")
def health():
    return jsonify({"status": "ok", "service": "blockchain-evoting-api"})
