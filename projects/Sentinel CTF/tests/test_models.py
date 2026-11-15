"""
Tests for core models and database.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from sentinel_ctf.core.models import (
    Category, Challenge, ChallengeStatus, Difficulty, Job, JobResult
)


def test_challenge_creation():
    ch = Challenge(name="Test", category=Category.WEB)
    assert ch.status == ChallengeStatus.NEW
    assert ch.id


def test_challenge_mark_solved():
    ch = Challenge(name="Test", category=Category.CRYPTO)
    ch.mark_solved("flag{test_flag}")
    assert ch.status == ChallengeStatus.SOLVED
    assert ch.flag == "flag{test_flag}"


def test_challenge_mark_in_progress():
    ch = Challenge(name="Test", category=Category.PWN)
    ch.mark_in_progress()
    assert ch.status == ChallengeStatus.IN_PROGRESS


def test_job_complete():
    result = JobResult(stdout="open 80", flags_found=["flag{found}"])
    job = Job(challenge_id="abc", tool="nmap", command="nmap 10.0.0.1")
    job.complete(result)
    assert job.status.value == "done"
    assert job.result.flags_found == ["flag{found}"]


def test_job_fail():
    job = Job(challenge_id="abc", tool="nmap", command="nmap 10.0.0.1")
    job.fail("Connection refused")
    assert job.status.value == "failed"
    assert job.error == "Connection refused"
