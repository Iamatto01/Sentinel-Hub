"""Nmap tool plugin for the Sentinel CTF Framework.

Wraps the ``nmap`` CLI to perform port and service scanning, then parses the
output into a structured dictionary suitable for downstream processing.
"""

from __future__ import annotations

import re
from typing import Any

from sentinel_ctf.core.models import JobResult
from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool

# ---------------------------------------------------------------------------
# Regex helpers
# ---------------------------------------------------------------------------

# Matches lines like:
#   80/tcp   open  http    Apache httpd 2.4.41 ((Ubuntu))
_PORT_RE = re.compile(
    r"^(?P<port>\d+)/(?P<protocol>\w+)\s+open\s+(?P<service>\S+)(?:\s+(?P<version>.+))?$",
    re.MULTILINE,
)

_FLAG_RE = re.compile(r"flag\{[^}]+\}", re.IGNORECASE)

# Matches "Host is up" anywhere in the output.
_HOST_UP_RE = re.compile(r"Host is up", re.IGNORECASE)


class NmapTool(BaseTool):
    """Nmap port and service scanner plugin.

    This tool wraps the ``nmap`` binary, builds a CLI command suitable for
    CTF reconnaissance, executes it via the framework executor, and returns a
    fully-parsed :class:`JobResult`.

    Attributes:
        name: Canonical tool identifier used throughout the framework.
        description: Human-readable summary shown in the tool registry.
    """

    name: str = "nmap"
    description: str = "Port and service scan"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        target: str,
        ports: str = "-",
        flags: str = "-sV -sC --open",
    ) -> str:
        """Construct the nmap CLI invocation string.

        Args:
            target: Hostname or IP address to scan.
            ports: Port range / specifier forwarded to ``-p``.  Defaults to
                ``-`` which means *all 65535 ports*.
            flags: Additional nmap flags.  Defaults to ``-sV -sC --open``
                (version detection, default scripts, show only open ports).

        Returns:
            A fully-formed shell command string ready to be executed.
        """
        output_file = f"/tmp/nmap_{target}.txt"
        return f"nmap {flags} -p {ports} {target} -oN {output_file}"

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse nmap stdout into a structured result dictionary.

        The parser extracts:

        * **open_ports** — list of dicts, each containing ``port``,
          ``protocol``, ``service``, and ``version`` keys.
        * **total_open** — integer count of open ports found.
        * **host_up** — boolean indicating whether the host responded.
        * **flags_found** — list of CTF flag strings matching
          ``flag{…}`` found anywhere in the output.
        * **raw** — the unmodified stdout string for reference.

        Args:
            result: :class:`ExecResult` produced by the executor after running
                the nmap command.

        Returns:
            A dictionary containing the keys listed above.
        """
        stdout: str = result.stdout or ""

        # --- parse open ports -------------------------------------------
        open_ports: list[dict[str, str]] = []
        for match in _PORT_RE.finditer(stdout):
            open_ports.append(
                {
                    "port": match.group("port"),
                    "protocol": match.group("protocol"),
                    "service": match.group("service"),
                    "version": (match.group("version") or "").strip(),
                }
            )

        # --- host status ------------------------------------------------
        host_up: bool = bool(_HOST_UP_RE.search(stdout))

        # --- flag extraction --------------------------------------------
        flags_found: list[str] = _FLAG_RE.findall(stdout)

        return {
            "open_ports": open_ports,
            "total_open": len(open_ports),
            "host_up": host_up,
            "flags_found": flags_found,
            "raw": stdout,
        }

    # ------------------------------------------------------------------
    # Convenience coroutine
    # ------------------------------------------------------------------

    async def scan(self, target: str, **kwargs: Any) -> JobResult:
        """Async convenience wrapper that runs a full nmap scan.

        This is a thin shim around :meth:`BaseTool.run` with the *target*
        argument already threaded through so callers can write::

            result = await nmap.scan("10.10.10.1", ports="1-1000")

        Args:
            target: Hostname or IP address to scan.
            **kwargs: Extra keyword arguments forwarded to :meth:`build_command`
                (e.g. ``ports``, ``flags``).

        Returns:
            A :class:`JobResult` containing the raw execution output and the
            structured dictionary produced by :meth:`parse`.
        """
        return await self.run(target=target, **kwargs)
