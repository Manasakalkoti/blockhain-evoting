from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
import os

load_dotenv()

db = SQLAlchemy()
migrate = Migrate()
limiter = Limiter(key_func=get_remote_address)


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")

    # Config
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL", "sqlite:///evoting_dev.db"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    app.config["REDIS_URL"] = redis_url
    app.config["RATELIMIT_STORAGE_URI"] = redis_url

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app)
    limiter.init_app(app)

    # Redis client + RQ queues
    from redis import Redis
    from rq import Queue
    from app import extensions

    extensions.redis_client = Redis.from_url(redis_url)
    extensions.queues = {
        "high": Queue("high", connection=extensions.redis_client),
        "default": Queue("default", connection=extensions.redis_client),
        "low": Queue("low", connection=extensions.redis_client),
    }

    # Import models so Flask-Migrate detects them
    from app import models  # noqa: F401

    # Register blueprints
    from app.api.health import health_bp
    from app.api.auth import auth_bp
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)

    return app
