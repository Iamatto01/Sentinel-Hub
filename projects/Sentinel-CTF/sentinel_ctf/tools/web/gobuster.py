"""Gobuster tool plugin for the Sentinel CTF Framework.

Wraps the ``gobuster`` CLI for directory and DNS brute-forcing, then parses
its text output into a structured result dictionary.
"""

from __future__ import annotations

import re
from typing import Any

from sentinel_ctf.core.models import JobResult
from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_WORDLIST = "/usr/share/seclists/Discovery/Web-Content/common.txt"

_FLAG_RE = re.compile(r"flag\{[^}]+\}", re.IGNORECASE)

# Matches lines emitted by gobuster, e.g.:
#   /admin                (Status: 301) [Size: 313] [--> http://target/admin/]
#   Found: subdomain.target.com
_FOUND_DIR_RE = re.compile(
    r"^(?P<path>/\S*)\s+\(Status:\s*(?P<status>\d+)\)",
    re.MULTILINE,
)

# DNS mode lines: "Found: <hostname>"
_FOUND_DNS_RE = re.compile(
    r"^Found:\s+(?P<host>\S+)",
    re.MULTILINE | re.IGNORECASE,
)

# Generic "Found:" prefix used as a broad fallback
_FOUND_GENERIC_RE = re.compile(
    r"^(?:Found|/).*$",
    re.MULTILINE,
)


class GobusterTool(BaseTool):
    """Gobuster directory and DNS brute-force tool plugin.

    Supports the ``dir`` and ``dns`` modes (and others supported natively by
    gobuster).  Output is parsed from stdout because gobuster does not produce
    machine-readable JSON by default.

    Attributes:
        name: Canonical tool identifier.
        description: Human-readable summary shown in the tool registry.
    """

    name: str = "gobuster"
    description: str = "Directory and DNS brute force"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        url: str,
        wordlist: str = _DEFAULT_WORDLIST,
        mode: str = "dir",
        extensions: str = "php,html,txt,js",
        threads: int = 50,
        extra_flags: str = "",
    ) -> str:
        """Construct the gobuster CLI invocation string.

        Args:
            url: Target URL (for ``dir`` mode) or base domain (for ``dns``
                mode).
            wordlist: Path to the wordlist file passed to ``-w``.
            mode: Gobuster operating mode (``dir``, ``dns``, ``vhost``, …).
            extensions: Comma-separated file extensions for ``-x``.  Only
                meaningful in ``dir`` mode.
            threads: Concurrent threads for ``-t``.
            extra_flags: Raw additional flags appended verbatim to the end of
                the command.

        Returns:
            A fully-formed shell command string.
        """
        parts: list[str] = [
            "gobuster",
            mode,
            f"-u {url}",
            f"-w {wordlist}",
            f"-x {extensions}",
            f"-t {threads}",
        ]

        if extra_flags:
            parts.append(extra_flags)

        return " ".join(parts)

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse gobuster stdout into a structured result dictionary.

        The parser looks for lines indicating discovered paths (dir mode) or
        hostnames (dns mode) and collects them into a unified ``found`` list.

        Returned keys:

        * **found** — list of dicts, each with ``url`` (the discovered path or
          hostname) and ``status`` (HTTP status code as int, or 0 for DNS
          findings where no status is available).
        * **total** — integer count of found items.
        * **flags_found** — list of CTF flag strings found in the output.
        * **raw** — unmodified stdout string.

        Args:
            result: :class:`ExecResult` produced by the executor.

        Returns:
            A structured result dictionary.
        """
        stdout: str = result.stdout or ""
        found: list[dict[str, Any]] = []

        # --- dir mode results -------------------------------------------
        dir_matches = list(_FOUND_DIR_RE.finditer(stdout))
        if dir_matches:
            for match in dir_matches:
                found.append(
                    {
                        "url": match.group("path"),
                        "status": int(match.group("status")),
                    }
                )
        else:
            # --- dns mode results ---------------------------------------
            dns_matches = list(_FOUND_DNS_RE.finditer(stdout))
            if dns_matches:
                for match in dns_matches:
                    found.append(
                        {
                            "url": match.group("host"),
                            "status": 0,
                        }
                    )

        # --- flag extraction --------------------------------------------
        flags_found: list[str] = _FLAG_RE.findall(stdout)

        return {
            "found": found,
            "total": len(found),
            "flags_found": flags_found,
            "raw": stdout,
        }

    # ------------------------------------------------------------------
    # Convenience coroutine
    # ------------------------------------------------------------------

    async def brute(self, url: str, **kwargs: Any) -> JobResult:
        """Async convenience wrapper that runs a gobuster brute-force.

        Example::

            result = await gobuster.brute("http://target/", mode="dir", threads=100)

        Args:
            url: Target URL or domain to brute-force.
            **kwargs: Extra keyword arguments forwarded to
                :meth:`build_command` (e.g. ``wordlist``, ``mode``,
                ``extensions``, ``threads``).

        Returns:
            A :class:`JobResult` containing raw output and parsed data.
        """
        return await self.run(url=url, **kwargs)
