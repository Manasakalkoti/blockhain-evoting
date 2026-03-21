from flask import Blueprint, jsonify, render_template, Response, request
import requests as http_requests
from app import extensions

health_bp = Blueprint("health", __name__)

VITE_DEV_URL = "http://localhost:5173"


def _proxy_to_vite():
    url = f"{VITE_DEV_URL}{request.path}"
    if request.query_string:
        url += f"?{request.query_string.decode()}"
    headers = {
        k: v for k, v in request.headers
        if k.lower() not in ("host", "origin", "referer")
    }
    try:
        resp = http_requests.get(url, headers=headers, stream=True, timeout=10)
        return Response(
            resp.iter_content(chunk_size=4096),
            status=resp.status_code,
            content_type=resp.headers.get("content-type", "text/plain"),
            headers={"Cache-Control": "no-cache"},
        )
    except http_requests.exceptions.ConnectionError:
        return "Vite dev server not running on port 5173", 502


@health_bp.route("/@<path:path>")
@health_bp.route("/src/<path:path>")
@health_bp.route("/node_modules/<path:path>")
@health_bp.route("/__vite_ping")
def vite_proxy(path=""):
    return _proxy_to_vite()


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


@health_bp.route("/", defaults={"path": ""})
@health_bp.route("/<path:path>")
def catch_all(path):
    return render_template("index.html")
