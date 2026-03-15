# Database Migrations

This project uses **Flask-Migrate** (Alembic) to manage schema changes.
All migration commands must be run from inside the `backend/` directory with the virtual environment active.

---

## Setup

```bash
cd backend
source venv/bin/activate
```

---

## One-Time Initialization

Only run this once per environment. Creates the `migrations/` directory.

```bash
flask db init
```

Do not re-run this if `migrations/` already exists — it will overwrite the directory.

---

## Workflow for Schema Changes

### 1. Edit the model

Add, remove, or modify columns/tables in `app/models/`.
If you add a new model file, import it in `app/models/__init__.py` so Alembic detects it.

### 2. Generate a migration

```bash
flask db migrate -m "short description of change"
```

This compares the current models against the database and writes a new file in `migrations/versions/`.
**Always review the generated file** before applying — auto-detection can miss some changes (e.g. column type changes, index renames).

### 3. Apply the migration

```bash
flask db upgrade
```

Applies all pending migrations to the database in order.

---

## Other Useful Commands

| Command | Description |
|---|---|
| `flask db current` | Show which migration version the DB is at |
| `flask db history` | List all migration versions |
| `flask db downgrade` | Roll back the last applied migration |
| `flask db downgrade base` | Roll back all migrations (empty DB) |
| `flask db show <revision>` | Show details of a specific migration |

---

## Project Tables

The initial migration (`initial schema - all tables`) created these tables:

| Table | Model file | Description |
|---|---|---|
| `organizations` | `models/organization.py` | Colleges / orgs that own elections |
| `users` | `models/user.py` | Admins and voters |
| `elections` | `models/election.py` | Election records with lifecycle status |
| `constituencies` | `models/constituency.py` | Sub-units within an election |
| `candidates` | `models/candidate.py` | Candidates scoped to a constituency |
| `election_voters` | `models/election_voter.py` | Eligible voter list from CSV upload |
| `voter_verifications` | `models/voter_verification.py` | Eligibility pre-verification results |
| `vote_transactions` | `models/vote_transaction.py` | On-chain vote records |

---

## Adding a New Model

1. Create `app/models/<name>.py` with the SQLAlchemy model class.
2. Add the import to `app/models/__init__.py`:
   ```python
   from app.models.<name> import <ClassName>  # noqa: F401
   ```
3. Run `flask db migrate -m "add <name> table"` then `flask db upgrade`.

---

## Notes

- `alembic_version` is a Alembic-managed table — do not edit it manually.
- Never modify a migration file that has already been applied in a shared environment. Create a new migration instead.
- The SQLite fallback (`evoting_dev.db`) defined in `app/__init__.py` is for emergencies only — always develop against MySQL to avoid dialect differences.
