"""whois_tool.py — Domain and IP WHOIS lookup tool.

Wraps the ``whois`` system utility, parses the colon-delimited key/value
output, and extracts commonly useful registration fields including registrar,
creation/expiry dates, name servers, and any embedded flags.
"""

from __future__ import annotations

import re
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# ---------------------------------------------------------------------------
# Field extraction patterns
# ---------------------------------------------------------------------------
_FLAG_RE = re.compile(r'flag\{[^}]+\}', re.IGNORECASE)

# Canonicalised field name → list of raw WHOIS key aliases
_FIELD_ALIASES: dict[str, list[str]] = {
    "registrar": [
        "registrar",
        "registrar name",
        "sponsoring registrar",
        "registrar organization",
    ],
    "creation_date": [
        "creation date",
        "created",
        "domain registration date",
        "registered",
        "registration time",
    ],
    "expiry_date": [
        "registry expiry date",
        "expiry date",
        "expiration date",
        "expires",
        "expire date",
        "expiration time",
    ],
}

_NAME_SERVER_KEYS = frozenset({
    "name server",
    "nserver",
    "nameserver",
    "name servers",
})

# Matches "Key: Value" lines, tolerating leading whitespace and
# multi-word keys separated by spaces or hyphens.
_KV_RE = re.compile(r'^\s*([^:]+?)\s*:\s*(.+)$')


class WhoisTool(BaseTool):
    """Domain / IP WHOIS lookup tool.

    Parameters
    ----------
    executor:
        A :class:`~sentinel_ctf.executor.base.BaseExecutor` instance used to
        run commands on the Kali host (or locally).
    """

    name: str = "whois"
    description: str = "Domain/IP WHOIS lookup"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(self, target: str) -> str:
        """Build the whois command for *target*.

        Parameters
        ----------
        target:
            A domain name (e.g. ``example.com``) or IP address.

        Returns
        -------
        str
            Shell command string, with stderr merged so partial results
            are still captured.
        """
        safe_target = re.sub(r'[^A-Za-z0-9.\-:]', '', target)
        return f"whois {safe_target} 2>&1"

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse WHOIS output into a structured dictionary.

        All ``Key: Value`` lines are collected into a flat dict (last value
        wins for duplicate keys).  Additionally the following fields are
        extracted with normalised names:

        ``registrar``     (str | None)  — Registrar name.
        ``creation_date`` (str | None)  — Domain creation timestamp.
        ``expiry_date``   (str | None)  — Domain expiry timestamp.
        ``name_servers``  (list[str])   — Deduplicated list of name servers.
        ``flags_found``   (list[str])   — Any flag-pattern matches in output.
        ``raw_fields``    (dict)        — All raw key/value pairs parsed.
        ``exit_code``     (int)         — Executor exit code.
        ``error``         (str)         — Stderr/mixed output on failure.

        Parameters
        ----------
        result:
            Raw :class:`~sentinel_ctf.executor.base.ExecResult` from the
            executor.
        """
        stdout: str = result.stdout or ""

        # --- Flag scan --------------------------------------------------
        flags_found: list[str] = list(dict.fromkeys(_FLAG_RE.findall(stdout)))

        # --- Key/value extraction ---------------------------------------
        raw_fields: dict[str, str] = {}
        name_servers: list[str] = []

        for line in stdout.splitlines():
            # Skip comment lines
            if line.lstrip().startswith('%') or line.lstrip().startswith('#'):
                continue
            m = _KV_RE.match(line)
            if not m:
                continue
            key_raw = m.group(1).strip()
            value = m.group(2).strip()
            if not value:
                continue

            key_lower = key_raw.lower()
            raw_fields[key_lower] = value  # last occurrence wins

            # Name servers accumulate
            if key_lower in _NAME_SERVER_KEYS:
                ns = value.rstrip('.').lower()
                if ns not in name_servers:
                    name_servers.append(ns)

        # --- Normalised canonical fields --------------------------------
        registrar = self._pick_field(raw_fields, _FIELD_ALIASES["registrar"])
        creation_date = self._pick_field(raw_fields, _FIELD_ALIASES["creation_date"])
        expiry_date = self._pick_field(raw_fields, _FIELD_ALIASES["expiry_date"])

        return {
            "registrar": registrar,
            "creation_date": creation_date,
            "expiry_date": expiry_date,
            "name_servers": name_servers,
            "flags_found": flags_found,
            "raw_fields": raw_fields,
            "exit_code": result.exit_code,
            "error": stdout.strip() if result.exit_code != 0 else "",
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _pick_field(
        raw_fields: dict[str, str],
        aliases: list[str],
    ) -> str | None:
        """Return the first matching value from *raw_fields* for *aliases*."""
        for alias in aliases:
            value = raw_fields.get(alias.lower())
            if value:
                return value
        return None

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def lookup(self, target: str, **kwargs: Any) -> JobResult:
        """Perform a WHOIS lookup on *target* and return a :class:`JobResult`.

        Parameters
        ----------
        target:
            Domain name or IP address to query.
        **kwargs:
            Forwarded to the underlying executor ``run`` call (e.g. timeout).

        Returns
        -------
        JobResult
            Structured result containing parsed WHOIS fields.
        """
        return await self.run(target=target, **kwargs)
