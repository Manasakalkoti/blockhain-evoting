"""
Shared extension instances.

Initialized to None here; `create_app()` populates them so that services
and other modules can import from this module without triggering circular
import errors.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from redis import Redis
    from rq import Queue

redis_client: "Redis | None" = None

# Named queues — populated by create_app()
# Usage: from app.extensions import queues; queues["high"].enqueue(fn, arg)
queues: dict[str, "Queue"] = {}


def get_queue(name: str = "default") -> "Queue":
    """Return the named RQ queue. Raises if extensions not initialized."""
    if name not in queues:
        raise RuntimeError(
            f"Queue '{name}' not found. Was create_app() called? "
            f"Available queues: {list(queues.keys())}"
        )
    return queues[name]
