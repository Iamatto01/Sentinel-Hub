"""
sentinel_ctf.core.flagfinder
=============================
Scan any text, file, or list of strings for flags using the configured regex.
Runs on both Windows (local) and Kali (via executor).
"""
from __future__ import annotations

import re
from pathlib import Path


def scan_text(text: str, flag_regex: str | None = None) -> list[str]:
    """Return all unique flag matches found in *text*."""
    from sentinel_ctf.core.config import config
    pattern = flag_regex or config.DEFAULT_FLAG_REGEX
    return list(set(re.findall(pattern, text, re.IGNORECASE)))


def scan_file(path: Path, flag_regex: str | None = None) -> list[str]:
    """Return all unique flag matches found in a local file."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return scan_text(text, flag_regex)
    except (OSError, PermissionError):
        return []


def scan_all(items: list[str], flag_regex: str | None = None) -> list[str]:
    """Scan a list of strings (stdout, notes, file contents) for flags."""
    results: list[str] = []
    for item in items:
        results.extend(scan_text(item, flag_regex))
    return list(set(results))


async def scan_remote_file(executor, remote_path: str, flag_regex: str | None = None) -> list[str]:
    """Read a remote file via executor and scan for flags."""
    from sentinel_ctf.executor.base import BaseExecutor
    result = await executor.run(f"cat {remote_path!r} 2>/dev/null")
    return scan_text(result.stdout, flag_regex)
