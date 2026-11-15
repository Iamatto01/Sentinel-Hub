"""
sentinel_ctf.executor.local
============================
Local executor — runs commands on the Windows host using asyncio subprocess.
Useful for tools installed natively (e.g. python scripts, curl, etc.).
"""
from __future__ import annotations

import asyncio
import shutil
import time
from pathlib import Path

from sentinel_ctf.executor.base import BaseExecutor, ExecResult


class LocalExecutor(BaseExecutor):
    """Runs commands on the local Windows/Linux host via asyncio subprocess."""

    async def run(
        self,
        command: str,
        cwd: str | None = None,
        timeout: float = 120.0,
        env: dict[str, str] | None = None,
    ) -> ExecResult:
        t0 = time.monotonic()
        try:
            proc = await asyncio.wait_for(
                asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=cwd,
                    env=env,
                ),
                timeout=5.0,
            )
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            return ExecResult("", f"Timed out after {timeout}s", 124, timeout, command)

        duration = time.monotonic() - t0
        return ExecResult(
            stdout=stdout_b.decode(errors="replace"),
            stderr=stderr_b.decode(errors="replace"),
            return_code=proc.returncode or 0,
            duration_s=duration,
            command=command,
        )

    async def upload(self, local_path: str, remote_path: str) -> None:
        """Copy a local file to another local path (used in testing)."""
        shutil.copy2(local_path, remote_path)

    async def download(self, remote_path: str, local_path: str) -> None:
        shutil.copy2(remote_path, local_path)

    async def close(self) -> None:
        pass
