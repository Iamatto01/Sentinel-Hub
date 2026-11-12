"""
sentinel_ctf.tools.osint.wayback_tool
=======================================
Wayback Machine archive lookup plugin.

Uses the CDX API to retrieve snapshots of a target URL, extracts timestamps,
original URLs, and HTTP status codes, and identifies historically interesting
paths (``/admin``, ``/.git``, ``/.env``, API endpoints, etc.).
"""
from __future__ import annotations

import json
import re
import urllib.parse
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)

# Paths that are commonly interesting in CTFs / pen-tests
_INTERESTING_PATH_RE = re.compile(
    r"/(?:admin|api|backup|config|\.git|\.env|\.svn|\.htpasswd|\.htaccess"
    r"|wp-admin|phpmyadmin|debug|console|shell|upload|secret|private|flag)",
    re.IGNORECASE,
)

_ARCHIVE_BASE = "https://web.archive.org/web"


class WaybackTool(BaseTool):
    """
    Queries the Wayback Machine CDX API for historical snapshots of a URL.

    The CDX API returns a JSON array of ``[timestamp, original, statuscode]``
    rows that are parsed and enriched by :meth:`parse`.
    """

    name: str = "wayback"
    description: str = "Wayback Machine archive lookup for deleted/historical pages"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        url: str,
        year: str = "*",
        output_format: str = "text",
        **kwargs: Any,
    ) -> str:
        """
        Build the CDX API curl command.

        Parameters
        ----------
        url:
            Target URL to search snapshots for.  Wildcards accepted
            (e.g. ``example.com/*``).
        year:
            Filter snapshots to this year (e.g. ``'2019'``).  Use ``'*'``
            for all years.
        output_format:
            Ignored in command construction — always fetches JSON for
            reliable parsing.

        Returns
        -------
        str
            Shell command string.
        """
        from_param = year if year != "*" else ""
        encoded_url = urllib.parse.quote(url, safe="/:.*?&=")
        cdx_url = (
            f"https://web.archive.org/cdx/search/cdx"
            f"?url={encoded_url}"
            f"&output=json"
            f"&fl=timestamp,original,statuscode"
            f"{'&from=' + from_param if from_param else ''}"
            f"&limit=50"
        )
        return f"curl -s '{cdx_url}' 2>/dev/null"

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse CDX API JSON response into structured snapshot data.

        Returns
        -------
        dict with keys:

        * ``snapshots`` – list of ``{timestamp, url, status}``
        * ``total`` – total snapshot count
        * ``oldest`` – oldest snapshot timestamp string
        * ``newest`` – newest snapshot timestamp string
        * ``interesting_paths`` – unique paths matching common sensitive patterns
        * ``flags_found`` – CTF flags found in the output
        """
        stdout = result.stdout or ""
        flags_found: list[str] = []
        snapshots: list[dict[str, Any]] = []
        interesting_paths: list[str] = []

        # Flags
        for flag_m in _FLAG_RE.finditer(stdout):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        try:
            raw_data = json.loads(stdout.strip())

            # CDX returns a 2-D array; the first row is the header
            rows = raw_data if isinstance(raw_data, list) else []
            if rows and isinstance(rows[0], list) and rows[0] == [
                "timestamp",
                "original",
                "statuscode",
            ]:
                rows = rows[1:]

            for row in rows:
                if not isinstance(row, list) or len(row) < 3:
                    continue
                timestamp, original, statuscode = str(row[0]), str(row[1]), str(row[2])
                snapshots.append(
                    {
                        "timestamp": timestamp,
                        "url": original,
                        "status": statuscode,
                    }
                )

                # Check path for interesting patterns
                try:
                    path = urllib.parse.urlparse(original).path
                except Exception:
                    path = original

                if _INTERESTING_PATH_RE.search(path) and path not in interesting_paths:
                    interesting_paths.append(path)

        except (json.JSONDecodeError, TypeError, ValueError):
            pass

        total = len(snapshots)
        oldest = snapshots[0]["timestamp"] if snapshots else ""
        newest = snapshots[-1]["timestamp"] if snapshots else ""

        return {
            "snapshots": snapshots,
            "total": total,
            "oldest": oldest,
            "newest": newest,
            "interesting_paths": interesting_paths,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------

    @staticmethod
    def build_snapshot_url(timestamp: str, original_url: str) -> str:
        """
        Construct a Wayback Machine replay URL.

        Parameters
        ----------
        timestamp:
            CDX timestamp string, e.g. ``'20190301120000'``.
        original_url:
            The original URL that was archived.

        Returns
        -------
        str
            Fully qualified Wayback Machine URL.
        """
        return f"{_ARCHIVE_BASE}/{timestamp}/{original_url}"

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def search(self, url: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        url:
            Target URL to look up in the Wayback Machine.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(url=url, **kwargs)
