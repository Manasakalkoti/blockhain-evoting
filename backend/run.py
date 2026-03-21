import click
from app import create_app, db
from app.models.user import User
import bcrypt

app = create_app()


@app.cli.command("create-admin")
@click.option("--name", prompt="Full name")
@click.option("--email", prompt="Email")
@click.option("--password", prompt="Password", hide_input=True, confirmation_prompt=True)
def create_admin(name, email, password):
    """Create an admin user."""
    if len(password) < 6:
        raise click.ClickException("Password must be at least 6 characters")
    if User.query.filter_by(email=email).first():
        raise click.ClickException(f"Email {email} is already registered")
    user = User(
        full_name=name,
        email=email,
        password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        role="admin",
    )
    db.session.add(user)
    db.session.commit()
    click.echo(f"Admin '{name}' created successfully.")


@app.cli.command("update-admin")
@click.option("--email", prompt="Current email")
@click.option("--new-email", default=None, help="New email (leave blank to keep)")
@click.option("--new-password", default=None, help="New password (leave blank to keep)", hide_input=True)
def update_admin(email, new_email, new_password):
    """Update an admin user's email or password."""
    user = User.query.filter_by(email=email, role="admin").first()
    if not user:
        raise click.ClickException(f"No admin found with email '{email}'")
    if new_email:
        user.email = new_email.strip().lower()
    if new_password:
        if len(new_password) < 6:
            raise click.ClickException("Password must be at least 6 characters")
        user.password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    db.session.commit()
    click.echo("Admin credentials updated.")


if __name__ == "__main__":
    app.run(debug=True, port=5001)
