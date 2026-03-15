"""
RQ worker entry point.

Run with:
    python worker.py

Or use the rq CLI directly (no Flask app context needed for the worker process
itself — individual jobs that need DB access should set up their own context):
    rq worker --with-scheduler high default low
"""

import os
from dotenv import load_dotenv
from redis import Redis
from rq import Worker, Queue

load_dotenv()

QUEUES = ["high", "default", "low"]


def main():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    conn = Redis.from_url(redis_url)
    queues = [Queue(name, connection=conn) for name in QUEUES]
    worker = Worker(queues, connection=conn)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
