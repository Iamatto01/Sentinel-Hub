"""pwntools_runner.py — Upload and execute pwntools exploit scripts on Kali.

This tool bridges the local exploit-development workflow with the remote
Kali executor: it uploads a locally crafted script, injects target host/port
as environment variables, runs it, and scrapes the output for flags.
"""

from __future__ import annotations

import os
import re
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# ---------------------------------------------------------------------------
# Default flag regex
# ---------------------------------------------------------------------------
_FLAG_RE = re.compile(r'flag\{[^}]+\}', re.IGNORECASE)


class PwntoolsRunner(BaseTool):
    """Run pwntools exploit scripts on the remote Kali executor.

    The typical workflow is:

    1. Write an exploit script locally (e.g. ``solve.py``).
    2. Call :meth:`exploit` with ``local_script`` pointing to that file and
       ``remote_dir`` set to a writable path on the Kali machine.
    3. The tool uploads the script, optionally injects ``HOST``/``PORT``
       environment variables, executes it, and returns a structured
       :class:`~sentinel_ctf.core.models.JobResult` with any flags found.

    Parameters
    ----------
    executor:
        A :class:`~sentinel_ctf.executor.base.BaseExecutor` instance used to
        upload files and run commands on the remote host.
    """

    name: str = "pwntools"
    description: str = "Run pwntools exploit scripts on Kali"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        script_path: str,
        target_host: str = "",
        target_port: int = 0,
        extra_env: dict[str, str] | None = None,
    ) -> str:
        """Build the shell command that executes the pwntools script.

        Environment variables are injected as ``KEY=VALUE`` prefixes so that
        the exploit script can read them via ``os.environ`` or pwntools'
        ``args`` mechanism without requiring command-line argument parsing.

        Parameters
        ----------
        script_path:
            Absolute path to the Python script **on the executor host**.
        target_host:
            Remote service hostname or IP.  Injected as ``HOST=<value>`` when
            non-empty.
        target_port:
            Remote service port.  Injected as ``PORT=<value>`` when > 0.
        extra_env:
            Additional ``KEY=VALUE`` pairs to prepend to the command.

        Returns
        -------
        str
            A shell command string ready to pass to the executor.
        """
        env_parts: list[str] = []

        if target_host:
            env_parts.append(f"HOST={_shell_quote(target_host)}")
        if target_port > 0:
            env_parts.append(f"PORT={target_port}")

        if extra_env:
            for key, value in extra_env.items():
                safe_key = re.sub(r'[^A-Za-z0-9_]', '_', key)
                env_parts.append(f"{safe_key}={_shell_quote(str(value))}")

        safe_script = _shell_quote(script_path)
        prefix = " ".join(env_parts)
        if prefix:
            return f"{prefix} python3 {safe_script}"
        return f"python3 {safe_script}"

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Scan executor output for flags and summarise the run.

        Parameters
        ----------
        result:
            Raw :class:`~sentinel_ctf.executor.base.ExecResult` from the
            executor.

        Returns
        -------
        dict with keys:

        ``output``      (str)        — Combined stdout.
        ``stderr``      (str)        — Stderr output.
        ``flags_found`` (list[str])  — Unique flags extracted from both
                                       stdout and stderr.
        ``exit_ok``     (bool)       — ``True`` when exit code is 0.
        ``exit_code``   (int)        — Raw exit code.
        """
        stdout: str = result.stdout or ""
        stderr: str = result.stderr or ""
        combined = stdout + "\n" + stderr

        flags_found: list[str] = list(dict.fromkeys(_FLAG_RE.findall(combined)))

        return {
            "output": stdout,
            "stderr": stderr,
            "flags_found": flags_found,
            "exit_ok": result.exit_code == 0,
            "exit_code": result.exit_code,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def exploit(
        self,
        local_script: str,
        remote_dir: str,
        target_host: str = "",
        target_port: int = 0,
        **kwargs: Any,
    ) -> JobResult:
        """Upload a local exploit script and run it on the remote executor.

        Steps
        -----
        1. Upload ``local_script`` to ``remote_dir`` via
           ``self.executor.upload()``.
        2. Build the execution command pointing at the uploaded file.
        3. Run via :meth:`run` which calls :meth:`build_command`,
           :meth:`parse`, and wraps everything in a :class:`JobResult`.

        Parameters
        ----------
        local_script:
            Absolute or relative path to the exploit script on the **local**
            machine.
        remote_dir:
            Directory on the **remote** executor host where the script will
            be uploaded.
        target_host:
            Hostname/IP of the CTF service.  Passed as ``HOST`` env var.
        target_port:
            Port of the CTF service.  Passed as ``PORT`` env var.
        **kwargs:
            Forwarded to the underlying executor ``run`` call (e.g. timeout).

        Returns
        -------
        JobResult
            Structured result, including any flags captured from stdout/stderr.

        Raises
        ------
        RuntimeError
            If the upload step fails.
        """
        # --- 1. Upload --------------------------------------------------
        script_basename = os.path.basename(local_script)
        remote_path = remote_dir.rstrip("/") + "/" + script_basename

        upload_ok = await self.executor.upload(local_script, remote_path)
        if not upload_ok:
            raise RuntimeError(
                f"Failed to upload '{local_script}' to '{remote_path}' on the executor."
            )

        # --- 2 & 3. Build command and run --------------------------------
        return await self.run(
            script_path=remote_path,
            target_host=target_host,
            target_port=target_port,
            **kwargs,
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _shell_quote(s: str) -> str:
    """Wrap *s* in single-quotes, escaping any embedded single-quotes.

    This is a lightweight alternative to ``shlex.quote`` that avoids
    importing the module at the top level.
    """
    return "'" + s.replace("'", r"'\''") + "'"
