"""
sentinel_ctf.core.models
========================
Pydantic models for challenges, jobs, and results.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class Category(str, Enum):
    WEB = "web"
    FORENSICS = "forensics"
    CRYPTO = "crypto"
    REVERSING = "reversing"
    PWN = "pwn"
    OSINT = "osint"
    MISC = "misc"


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    INSANE = "insane"


class ChallengeStatus(str, Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    SOLVED = "solved"
    STUCK = "stuck"
    SKIPPED = "skipped"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ---------------------------------------------------------------------------
# Challenge
# ---------------------------------------------------------------------------

class ChallengeFile(BaseModel):
    """A file associated with a challenge."""
    name: str
    local_path: Path
    remote_path: str | None = None
    sha256: str | None = None
    size_bytes: int | None = None


class Challenge(BaseModel):
    """Core challenge record."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: Category
    difficulty: Difficulty = Difficulty.MEDIUM
    platform: str = ""          # e.g. "HackTheBox", "PicoCTF", "custom"
    event: str = ""             # e.g. "CTF 2026"
    description: str = ""
    points: int = 0
    flag_format: str = r"flag\{[^}]+\}"   # regex
    flag: str | None = None     # filled when solved
    status: ChallengeStatus = ChallengeStatus.NEW
    tags: list[str] = Field(default_factory=list)
    files: list[ChallengeFile] = Field(default_factory=list)
    target_host: str | None = None
    target_port: int | None = None
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # workspace paths (resolved at runtime)
    workspace_dir: Path | None = None

    def mark_solved(self, flag: str) -> None:
        self.flag = flag
        self.status = ChallengeStatus.SOLVED
        self.updated_at = datetime.utcnow()

    def mark_in_progress(self) -> None:
        self.status = ChallengeStatus.IN_PROGRESS
        self.updated_at = datetime.utcnow()


# ---------------------------------------------------------------------------
# Job
# ---------------------------------------------------------------------------

class JobResult(BaseModel):
    """Output captured from a single tool run."""
    stdout: str = ""
    stderr: str = ""
    return_code: int = 0
    duration_s: float = 0.0
    artifacts: list[str] = Field(default_factory=list)   # file paths produced
    parsed: dict[str, Any] = Field(default_factory=dict) # structured output from parser
    flags_found: list[str] = Field(default_factory=list)


class Job(BaseModel):
    """A single tool execution tracked against a challenge."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    challenge_id: str
    tool: str             # e.g. "nmap", "ffuf", "binwalk"
    command: str          # full command string sent to executor
    status: JobStatus = JobStatus.PENDING
    result: JobResult | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = None
    error: str | None = None

    def complete(self, result: JobResult) -> None:
        self.result = result
        self.status = JobStatus.DONE
        self.finished_at = datetime.utcnow()

    def fail(self, error: str) -> None:
        self.error = error
        self.status = JobStatus.FAILED
        self.finished_at = datetime.utcnow()


# ---------------------------------------------------------------------------
# Writeup
# ---------------------------------------------------------------------------

class WriteupSection(BaseModel):
    heading: str
    content: str


class Writeup(BaseModel):
    """Auto-generated writeup structure."""
    challenge_id: str
    challenge_name: str
    category: Category
    flag: str
    sections: list[WriteupSection] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
