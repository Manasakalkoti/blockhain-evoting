# Redis and RQ Setup

## Requirements

- macOS with Homebrew installed
- Redis 7.x (installed via Homebrew)
- Python dependencies: `redis`, `rq` (already in `backend/requirements.txt`)

---

## Installation

If Redis is not yet installed:

```bash
brew install redis
```

---

## Starting the Server

Start Redis as a background service (auto-restarts on login):

```bash
brew services start redis
```

Check that it is running:

```bash
brew services list | grep redis
```

Expected output: `redis   started`

Verify the server responds:

```bash
redis-cli ping
```

Expected output: `PONG`

---

## Connection Details

These match `backend/.env` and must stay in sync:

| Field | Value                        |
|-------|------------------------------|
| Host  | localhost                    |
| Port  | 6379                         |
| DB    | 0                            |
| URL   | `redis://localhost:6379/0`   |

The `REDIS_URL` key in `backend/.env` must match the URL above.

---

## How Redis Is Used in This Project

| Purpose              | Detail                                                          |
|----------------------|-----------------------------------------------------------------|
| **Cache / general**  | `extensions.redis_client` — raw Redis client for any key-value ops |
| **Rate limiting**    | Flask-Limiter uses Redis as its storage backend (`RATELIMIT_STORAGE_URI`) |
| **Background jobs**  | RQ queues (`high`, `default`, `low`) backed by Redis            |

---

## Starting the RQ Worker

The worker must be running for any background job to execute. Start it from the `backend/` directory with the virtualenv active:

```bash
cd backend
source venv/bin/activate

# Option A — Python script (recommended during development)
python worker.py

# Option B — rq CLI
rq worker --with-scheduler high default low
```

Both options start a single worker process that listens on all three queues in priority order (`high` first, then `default`, then `low`).

The `--with-scheduler` flag enables scheduled/deferred jobs (e.g. jobs enqueued with `job_timeout` or `at=`).

---

## Enqueuing Background Jobs

Import `get_queue` from `app.extensions` and call `.enqueue()`:

```python
from app.extensions import get_queue

# Enqueue a function to run immediately on the high-priority queue
get_queue("high").enqueue(some_function, arg1, arg2)

# Enqueue on the default queue
get_queue("default").enqueue(some_function, arg1)

# Enqueue on the low-priority queue with a timeout
get_queue("low").enqueue(some_function, arg1, job_timeout=300)
```

Job functions must be importable at the module level (top-level functions in `app/services/`). Do not pass lambdas or closures.

### Example — adding a job in a route

```python
from flask import Blueprint, jsonify
from app.extensions import get_queue
from app.services.merkle import build_merkle_tree

bp = Blueprint("elections", __name__)

@bp.route("/api/elections/<int:election_id>/deploy", methods=["POST"])
def deploy_election(election_id):
    job = get_queue("high").enqueue(build_merkle_tree, election_id)
    return jsonify({"job_id": job.id}), 202
```

### Example — a job function in `app/services/`

```python
# app/services/merkle.py

def build_merkle_tree(election_id: int):
    """Called by RQ worker. Must not rely on Flask request context."""
    from app import create_app, db
    from app.models.election import Election

    app = create_app()
    with app.app_context():
        election = db.session.get(Election, election_id)
        # ... build tree, write results back to DB
```

> Jobs that need the database must create their own app context via `create_app()` as shown above, because the worker process is separate from the Flask server.

---

## Monitoring Queues

Check queue lengths from the CLI:

```bash
redis-cli llen rq:queue:high
redis-cli llen rq:queue:default
redis-cli llen rq:queue:low
```

List failed jobs:

```bash
rq info --url redis://localhost:6379/0
```

---

## Health Check

The `/api/health` endpoint pings Redis on every request:

```bash
curl http://localhost:5001/api/health
```

Response when Redis is up:

```json
{ "status": "ok", "service": "blockchain-evoting-api", "redis": "ok" }
```

Response when Redis is down:

```json
{ "status": "degraded", "service": "blockchain-evoting-api", "redis": "unavailable" }
```

HTTP status is `200` when healthy, `503` when degraded.

---

## Stopping the Server

```bash
brew services stop redis
```

---

## Troubleshooting

**`redis-cli ping` returns `Connection refused`:**
Redis is not running. Start it with `brew services start redis`.

**Worker exits immediately with `NoRedisConnectionError`:**
Check that `REDIS_URL` in `backend/.env` matches a running Redis instance.

**Jobs stuck in queue, never executed:**
No worker is running. Start `python worker.py` in a separate terminal.

**Port 6379 already in use:**
Another Redis instance may be running. Check with:
```bash
lsof -i :6379
```
