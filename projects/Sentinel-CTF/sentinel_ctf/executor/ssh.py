"""
sentinel_ctf.executor.ssh
=========================
Kali Linux SSH executor via asyncssh.

Connects through the Cloudflare Tunnel proxy (cloudflared access tcp)
on localhost:2222, or directly if KALI_HOST/PORT are overridden in .env.

Connection is kept alive with a keepalive every 30 seconds so long-running
scans don't drop.
"""
from __future__ import annotations

import asyncio
import time
from pathlib import Path

import asyncssh

from sentinel_ctf.core.config import config
from sentinel_ctf.executor.base import BaseExecutor, ExecResult


class KaliSSHExecutor(BaseExecutor):
    """
    Async SSH executor targeting the Kali VM over the Cloudflare Tunnel.

    Parameters
    ----------
    host, port, user, key_path:
        Override the .env defaults for a single executor instance.
    challenge_root:
        Base directory on Kali where challenge files live.
    """

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        key_path: Path | None = None,
        challenge_root: str | None = None,
    ) -> None:
        self._host = host or config.KALI_HOST
        self._port = port or config.KALI_PORT
        self._user = user or config.KALI_USER
        self._key_path = key_path or config.KALI_KEY_PATH
        self._challenge_root = challenge_root or config.KALI_CHALLENGE_ROOT
        self._conn: asyncssh.SSHClientConnection | None = None

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Open the SSH connection. Called automatically by __aenter__."""
        self._conn = await asyncssh.connect(
            host=self._host,
            port=self._port,
            username=self._user,
            client_keys=[str(self._key_path)],
            known_hosts=None,           # tunnel cert changes; disable host checking
            keepalive_interval=30,
            keepalive_count_max=10,
        )

    async def close(self) -> None:
        if self._conn:
            self._conn.close()
            await self._conn.wait_closed()
            self._conn = None

    async def __aenter__(self) -> "KaliSSHExecutor":
        await self.connect()
        return self

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def run(
        self,
        command: str,
        cwd: str | None = None,
        timeout: float = 300.0,
        env: dict[str, str] | None = None,
    ) -> ExecResult:
        """
        Run *command* on Kali. If *cwd* is given the command is prefixed with
        ``cd <cwd> &&`` so it runs in the right directory.
        """
        if self._conn is None:
            raise RuntimeError("Not connected. Use 'async with KaliSSHExecutor() as ex:'")

        full_cmd = command
        if cwd:
            full_cmd = f"cd {cwd!r} && {command}"

        env_prefix = ""
        if env:
            env_prefix = " ".join(f"{k}={v!r}" for k, v in env.items()) + " "

        t0 = time.monotonic()
        try:
            result = await asyncio.wait_for(
                self._conn.run(env_prefix + full_cmd, check=False),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            return ExecResult(
                stdout="",
                stderr=f"[sentinel-ctf] Command timed out after {timeout}s",
                return_code=124,
                duration_s=timeout,
                command=command,
            )
        duration = time.monotonic() - t0

        return ExecResult(
            stdout=result.stdout or "",
            stderr=result.stderr or "",
            return_code=result.returncode or 0,
            duration_s=duration,
            command=command,
        )

    async def upload(self, local_path: str, remote_path: str) -> None:
        """SCP a local file to the Kali VM."""
        if self._conn is None:
            raise RuntimeError("Not connected.")
        async with self._conn.start_sftp_client() as sftp:
            await sftp.put(local_path, remote_path)

    async def download(self, remote_path: str, local_path: str) -> None:
        """SCP a file from Kali to the local host."""
        if self._conn is None:
            raise RuntimeError("Not connected.")
        async with self._conn.start_sftp_client() as sftp:
            await sftp.get(remote_path, local_path)

    async def mkdir(self, remote_path: str) -> None:
        """Create a directory on Kali (including parents)."""
        await self.run(f"mkdir -p {remote_path!r}")

    async def exists(self, remote_path: str) -> bool:
        """Return True if the remote path exists."""
        result = await self.run(f"test -e {remote_path!r} && echo yes || echo no")
        return result.stdout.strip() == "yes"

    async def read_file(self, remote_path: str) -> str:
        """Return the text content of a remote file."""
        result = await self.run(f"cat {remote_path!r}")
        return result.stdout

    # ------------------------------------------------------------------
    # Convenience: ensure challenge workspace exists on Kali
    # ------------------------------------------------------------------

    async def ensure_challenge_dir(self, challenge_name: str) -> str:
        """
        Create and return the remote challenge directory path.
        Pattern: <KALI_CHALLENGE_ROOT>/<challenge_name>/
        """
        safe_name = challenge_name.replace(" ", "_").lower()
        remote_dir = f"{self._challenge_root}/{safe_name}"
        await self.mkdir(remote_dir)
        return remote_dir
