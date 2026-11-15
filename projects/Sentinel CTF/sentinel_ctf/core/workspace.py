"""
sentinel_ctf.core.workspace
============================
Creates and manages the local challenge workspace directory.
Each challenge gets its own folder with a pre-filled notes file,
a solve.py template, and a files/ subdirectory.
"""
from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from sentinel_ctf.core.config import config
from sentinel_ctf.core.models import Category, Challenge


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

_NOTES_TEMPLATE = """\
# {name}

**Category:** {category}  
**Platform:** {platform}  
**Event:** {event}  
**Points:** {points}  
**Status:** in_progress  
**Created:** {created_at}

---

## Description

{description}

---

## Target

```
Host: {target_host}
Port: {target_port}
```

---

## Files

{files_list}

---

## Triage Notes

<!-- Fill in as you discover things -->

## Approach

<!-- Step-by-step what you tried -->

## Key Findings

<!-- Key observations -->

## Solution

<!-- Final steps to get the flag -->

## Flag

```
{flag_placeholder}
```

---

## Tools Used

- 

## References

- 
"""

_SOLVE_TEMPLATE = """\
#!/usr/bin/env python3
\"\"\"
Solve script for: {name}
Category: {category}
Platform: {platform}
\"\"\"
import os
import sys

# Challenge target
TARGET_HOST = os.getenv("HOST", "{target_host}")
TARGET_PORT = int(os.getenv("PORT", "{target_port}"))

# ---------------------------------------------------------------------------
# Imports — uncomment what you need
# ---------------------------------------------------------------------------
# from pwn import *
# import requests
# import hashlib, base64, struct, binascii
# from Crypto.Util.number import long_to_bytes, bytes_to_long

FLAG_REGEX = r"{flag_regex}"


def solve():
    # TODO: implement your solve
    pass


if __name__ == "__main__":
    flag = solve()
    if flag:
        print(f"[+] FLAG: {{flag}}")
    else:
        print("[-] No flag found")
"""


# ---------------------------------------------------------------------------
# Workspace manager
# ---------------------------------------------------------------------------

def slugify(name: str) -> str:
    import re
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug


def create_workspace(challenge: Challenge) -> Path:
    """
    Create the local challenge workspace and return its path.
    Idempotent — safe to call on an existing workspace.
    """
    root = config.HOST_CHALLENGE_ROOT
    slug = slugify(challenge.name)
    workspace = root / slug
    files_dir = workspace / "files"
    workspace.mkdir(parents=True, exist_ok=True)
    files_dir.mkdir(exist_ok=True)

    # notes.md
    notes_path = workspace / "notes.md"
    if not notes_path.exists():
        files_list = "\n".join(f"- `{f.name}`" for f in challenge.files) or "- (no files yet)"
        notes_path.write_text(
            _NOTES_TEMPLATE.format(
                name=challenge.name,
                category=challenge.category.value,
                platform=challenge.platform or "-",
                event=challenge.event or "-",
                points=challenge.points,
                created_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
                description=challenge.description or "(no description)",
                target_host=challenge.target_host or "-",
                target_port=challenge.target_port or "-",
                files_list=files_list,
                flag_placeholder=f"flag{{...}}",
            ),
            encoding="utf-8",
        )

    # solve.py
    solve_path = workspace / "solve.py"
    if not solve_path.exists():
        solve_path.write_text(
            _SOLVE_TEMPLATE.format(
                name=challenge.name,
                category=challenge.category.value,
                platform=challenge.platform or "",
                target_host=challenge.target_host or "127.0.0.1",
                target_port=challenge.target_port or 0,
                flag_regex=challenge.flag_format,
            ),
            encoding="utf-8",
        )

    # Update challenge object
    challenge.workspace_dir = workspace
    return workspace


def open_workspace(challenge: Challenge) -> None:
    """Open the workspace directory in Windows Explorer."""
    import subprocess
    if challenge.workspace_dir and challenge.workspace_dir.exists():
        subprocess.Popen(["explorer", str(challenge.workspace_dir)])


def archive_workspace(challenge: Challenge, writeup_dir: Path) -> Path:
    """
    Copy the challenge workspace into the writeup archive after solving.
    Returns the archive path.
    """
    if not challenge.workspace_dir or not challenge.workspace_dir.exists():
        raise ValueError("Challenge has no workspace to archive.")
    slug = slugify(challenge.name)
    dest = writeup_dir / challenge.category.value / slug
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(challenge.workspace_dir, dest)
    return dest
