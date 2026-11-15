"""
sentinel_ctf.core.database
==========================
SQLite persistence using Python's built-in sqlite3 (no SQLAlchemy dependency).
This avoids the Cython .pyd DLL that gets blocked by Windows AppControl policies.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Generator

from sentinel_ctf.core.config import config
from sentinel_ctf.core.models import (
    Category, Challenge, ChallengeStatus, Difficulty, Job, JobStatus,
    JobResult, Writeup
)

# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def _get_db_path() -> Path:
    return config.DB_PATH


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_get_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_CREATE_CHALLENGES = """
CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium',
    platform TEXT DEFAULT '',
    event TEXT DEFAULT '',
    description TEXT DEFAULT '',
    points INTEGER DEFAULT 0,
    flag_format TEXT DEFAULT '',
    flag TEXT,
    status TEXT DEFAULT 'new',
    tags TEXT DEFAULT '[]',
    target_host TEXT,
    target_port INTEGER,
    notes TEXT DEFAULT '',
    workspace_dir TEXT,
    created_at TEXT,
    updated_at TEXT
)
"""

_CREATE_JOBS = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    challenge_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    stdout TEXT DEFAULT '',
    stderr TEXT DEFAULT '',
    return_code INTEGER DEFAULT 0,
    duration_s REAL DEFAULT 0,
    artifacts TEXT DEFAULT '[]',
    parsed TEXT DEFAULT '{}',
    flags_found TEXT DEFAULT '[]',
    error TEXT,
    created_at TEXT,
    finished_at TEXT
)
"""

_CREATE_WRITEUPS = """
CREATE TABLE IF NOT EXISTS writeups (
    id TEXT PRIMARY KEY,
    challenge_id TEXT NOT NULL,
    challenge_name TEXT NOT NULL,
    category TEXT NOT NULL,
    flag TEXT NOT NULL,
    sections TEXT DEFAULT '[]',
    tools_used TEXT DEFAULT '[]',
    created_at TEXT
)
"""


def init_db() -> None:
    """Create all tables if they do not exist."""
    _get_db_path().parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.execute(_CREATE_CHALLENGES)
        conn.execute(_CREATE_JOBS)
        conn.execute(_CREATE_WRITEUPS)


# ---------------------------------------------------------------------------
# Challenge CRUD
# ---------------------------------------------------------------------------

def save_challenge(ch: Challenge) -> None:
    ch.updated_at = datetime.utcnow()
    row = (
        ch.id, ch.name, ch.category.value, ch.difficulty.value,
        ch.platform, ch.event, ch.description, ch.points,
        ch.flag_format, ch.flag, ch.status.value,
        json.dumps(ch.tags), ch.target_host, ch.target_port,
        ch.notes, str(ch.workspace_dir) if ch.workspace_dir else None,
        ch.created_at.isoformat(), ch.updated_at.isoformat(),
    )
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO challenges
              (id,name,category,difficulty,platform,event,description,points,
               flag_format,flag,status,tags,target_host,target_port,notes,
               workspace_dir,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, category=excluded.category,
              difficulty=excluded.difficulty, platform=excluded.platform,
              event=excluded.event, description=excluded.description,
              points=excluded.points, flag_format=excluded.flag_format,
              flag=excluded.flag, status=excluded.status, tags=excluded.tags,
              target_host=excluded.target_host, target_port=excluded.target_port,
              notes=excluded.notes, workspace_dir=excluded.workspace_dir,
              updated_at=excluded.updated_at
        """, row)


def get_challenge(challenge_id: str) -> Challenge | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM challenges WHERE id = ?", (challenge_id,)
        ).fetchone()
    return _row_to_challenge(dict(row)) if row else None


def list_challenges(
    category: Category | None = None,
    status: ChallengeStatus | None = None,
) -> list[Challenge]:
    query = "SELECT * FROM challenges WHERE 1=1"
    params: list = []
    if category:
        query += " AND category = ?"
        params.append(category.value)
    if status:
        query += " AND status = ?"
        params.append(status.value)
    query += " ORDER BY created_at DESC"
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_row_to_challenge(dict(r)) for r in rows]


def delete_challenge(challenge_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM challenges WHERE id = ?", (challenge_id,))
        conn.execute("DELETE FROM jobs WHERE challenge_id = ?", (challenge_id,))


def _row_to_challenge(d: dict) -> Challenge:
    d["tags"] = json.loads(d.get("tags") or "[]")
    d["category"] = Category(d["category"])
    d["difficulty"] = Difficulty(d["difficulty"])
    d["status"] = ChallengeStatus(d["status"])
    d["workspace_dir"] = Path(d["workspace_dir"]) if d.get("workspace_dir") else None
    # Parse ISO datetime strings
    for field in ("created_at", "updated_at"):
        if isinstance(d.get(field), str):
            try:
                d[field] = datetime.fromisoformat(d[field])
            except (ValueError, TypeError):
                d[field] = datetime.utcnow()
    return Challenge(**d)


# ---------------------------------------------------------------------------
# Job CRUD
# ---------------------------------------------------------------------------

def save_job(job: Job) -> None:
    r = job.result
    row = (
        job.id, job.challenge_id, job.tool, job.command, job.status.value,
        r.stdout if r else "", r.stderr if r else "",
        r.return_code if r else 0, r.duration_s if r else 0.0,
        json.dumps(r.artifacts if r else []),
        json.dumps(r.parsed if r else {}),
        json.dumps(r.flags_found if r else []),
        job.error,
        job.created_at.isoformat(),
        job.finished_at.isoformat() if job.finished_at else None,
    )
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO jobs
              (id,challenge_id,tool,command,status,stdout,stderr,return_code,
               duration_s,artifacts,parsed,flags_found,error,created_at,finished_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              status=excluded.status, stdout=excluded.stdout,
              stderr=excluded.stderr, return_code=excluded.return_code,
              duration_s=excluded.duration_s, artifacts=excluded.artifacts,
              parsed=excluded.parsed, flags_found=excluded.flags_found,
              error=excluded.error, finished_at=excluded.finished_at
        """, row)


def list_jobs(challenge_id: str) -> list[Job]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE challenge_id = ? ORDER BY created_at",
            (challenge_id,),
        ).fetchall()
    return [_row_to_job(dict(r)) for r in rows]


def _row_to_job(d: dict) -> Job:
    result = JobResult(
        stdout=d.get("stdout", ""),
        stderr=d.get("stderr", ""),
        return_code=d.get("return_code", 0),
        duration_s=d.get("duration_s", 0.0),
        artifacts=json.loads(d.get("artifacts") or "[]"),
        parsed=json.loads(d.get("parsed") or "{}"),
        flags_found=json.loads(d.get("flags_found") or "[]"),
    )
    for field in ("created_at", "finished_at"):
        if isinstance(d.get(field), str):
            try:
                d[field] = datetime.fromisoformat(d[field])
            except (ValueError, TypeError):
                d[field] = None
    return Job(
        id=d["id"],
        challenge_id=d["challenge_id"],
        tool=d["tool"],
        command=d["command"],
        status=JobStatus(d["status"]),
        result=result,
        error=d.get("error"),
        created_at=d.get("created_at") or datetime.utcnow(),
        finished_at=d.get("finished_at"),
    )
