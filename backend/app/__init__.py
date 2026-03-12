from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

db = SQLAlchemy()
migrate = Migrate()


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")

    # Config
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL", "sqlite:///evoting_dev.db"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app)

    # Import models so Flask-Migrate detects them
    from app import models  # noqa: F401

    # Register blueprints
    from app.api.health import health_bp
    app.register_blueprint(health_bp)

    return app
