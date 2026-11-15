"""
Tests for the workspace generator.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from sentinel_ctf.core.models import Category, Challenge, Difficulty
from sentinel_ctf.core.workspace import create_workspace, slugify


def test_slugify():
    assert slugify("My Web Challenge!") == "my_web_challenge"
    assert slugify("Test 123") == "test_123"


def test_create_workspace(tmp_path, monkeypatch):
    # Redirect HOST_CHALLENGE_ROOT to a temp dir
    from sentinel_ctf.core import config as cfg_module
    monkeypatch.setattr(cfg_module.config, "HOST_CHALLENGE_ROOT", tmp_path)

    ch = Challenge(
        name="Test Challenge",
        category=Category.WEB,
        difficulty=Difficulty.EASY,
        target_host="10.0.0.1",
        target_port=80,
    )
    workspace = create_workspace(ch)

    assert workspace.exists()
    assert (workspace / "notes.md").exists()
    assert (workspace / "solve.py").exists()
    assert (workspace / "files").exists()
    assert ch.workspace_dir == workspace


def test_create_workspace_idempotent(tmp_path, monkeypatch):
    from sentinel_ctf.core import config as cfg_module
    monkeypatch.setattr(cfg_module.config, "HOST_CHALLENGE_ROOT", tmp_path)

    ch = Challenge(name="Idempotent Test", category=Category.FORENSICS)
    workspace1 = create_workspace(ch)
    # Modify notes
    (workspace1 / "notes.md").write_text("custom content", encoding="utf-8")
    # Create again — should not overwrite existing notes
    workspace2 = create_workspace(ch)
    assert workspace1 == workspace2
    assert (workspace2 / "notes.md").read_text() == "custom content"
