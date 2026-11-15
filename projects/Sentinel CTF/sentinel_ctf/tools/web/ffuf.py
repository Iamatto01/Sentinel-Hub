"""ffuf (Fuzz Faster U Fool) tool plugin for the Sentinel CTF Framework.

Wraps the ``ffuf`` CLI for web directory and parameter fuzzing, then parses
both JSON and text output into a structured result dictionary.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from sentinel_ctf.core.models import JobResult
from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_WORDLIST = "/usr/share/seclists/Discovery/Web-Content/common.txt"
_OUTPUT_FILE = "/tmp/ffuf_out.json"
_DEFAULT_MATCH_CODES = "200,301,302,403"

_FLAG_RE = re.compile(r"flag\{[^}]+\}", re.IGNORECASE)

# Matches coloured/plain text lines like:
#   http://target/admin                 [Status: 200, Size: 1234, Words: 56, Lines: 78]
_TEXT_RESULT_RE = re.compile(
    r"(?P<url>https?://\S+)\s+\[Status:\s*(?P<status>\d+),\s*Size:\s*(?P<size>\d+)",
    re.IGNORECASE,
)


class FfufTool(BaseTool):
    """ffuf web fuzzing tool plugin.

    Builds and executes ffuf commands for directory enumeration and parameter
    fuzzing.  Output is parsed from the JSON report file written by ffuf; if
    that file is unavailable the tool falls back to text-based parsing.

    Attributes:
        name: Canonical tool identifier.
        description: Human-readable summary shown in the tool registry.
    """

    name: str = "ffuf"
    description: str = "Web fuzzing"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        url: str,
        wordlist: str = _DEFAULT_WORDLIST,
        method: str = "GET",
        extensions: str = "",
        filter_size: str = "",
        extra_flags: str = "",
    ) -> str:
        """Construct the ffuf CLI invocation string.

        ``FUZZ`` is automatically appended to *url* if it is not already
        present so the caller can supply either a raw base URL or a
        pre-templated one.

        Args:
            url: Target URL.  ``FUZZ`` will be appended if absent.
            wordlist: Path to the wordlist file.
            method: HTTP method (GET, POST, …).
            extensions: Comma-separated list of file extensions to append to
                each word (e.g. ``"php,html,txt"``).  Passed to ``-e``.
                Ignored when empty.
            filter_size: Response size to filter out (``-fs``).
                Ignored when empty.
            extra_flags: Any additional raw flags appended verbatim.

        Returns:
            A fully-formed shell command string.
        """
        # Ensure FUZZ placeholder is present
        fuzz_url = url if "FUZZ" in url else f"{url.rstrip('/')}/FUZZ"

        parts: list[str] = [
            "ffuf",
            f"-w {wordlist}",
            f"-u {fuzz_url}",
            f"-X {method}",
            f"-mc {_DEFAULT_MATCH_CODES}",
            f"-o {_OUTPUT_FILE}",
            "-of json",
        ]

        if extensions:
            parts.append(f"-e {extensions}")

        if filter_size:
            parts.append(f"-fs {filter_size}")

        if extra_flags:
            parts.append(extra_flags)

        return " ".join(parts)

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse ffuf output into a structured result dictionary.

        The method first attempts to read and decode the JSON file written by
        ffuf (``/tmp/ffuf_out.json``).  If that file does not exist or is
        malformed it falls back to regex-based parsing of stdout.

        Returned keys:

        * **results** — list of dicts, each with ``url``, ``status``,
          ``size``, and ``words``.
        * **total** — integer count of results.
        * **flags_found** — list of CTF flag strings found in the output.
        * **raw** — unmodified stdout string.

        Args:
            result: :class:`ExecResult` produced by the executor.

        Returns:
            A structured result dictionary.
        """
        stdout: str = result.stdout or ""
        parsed_results: list[dict[str, Any]] = []

        # --- primary: try JSON output file ------------------------------
        json_parsed = False
        if os.path.isfile(_OUTPUT_FILE):
            try:
                with open(_OUTPUT_FILE, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                entries = data.get("results") or []
                for entry in entries:
                    parsed_results.append(
                        {
                            "url": entry.get("url", ""),
                            "status": entry.get("status", 0),
                            "size": entry.get("length", 0),
                            "words": entry.get("words", 0),
                        }
                    )
                json_parsed = True
            except (json.JSONDecodeError, OSError):
                pass

        # --- fallback: text output --------------------------------------
        if not json_parsed:
            for match in _TEXT_RESULT_RE.finditer(stdout):
                parsed_results.append(
                    {
                        "url": match.group("url"),
                        "status": int(match.group("status")),
                        "size": int(match.group("size")),
                        "words": 0,  # not available in text mode
                    }
                )

        # --- flag extraction --------------------------------------------
        flags_found: list[str] = _FLAG_RE.findall(stdout)

        return {
            "results": parsed_results,
            "total": len(parsed_results),
            "flags_found": flags_found,
            "raw": stdout,
        }

    # ------------------------------------------------------------------
    # Convenience coroutine
    # ------------------------------------------------------------------

    async def fuzz(self, url: str, **kwargs: Any) -> JobResult:
        """Async convenience wrapper that runs an ffuf fuzz operation.

        Example::

            result = await ffuf.fuzz("http://target/", extensions="php,html")

        Args:
            url: Target URL to fuzz.
            **kwargs: Extra keyword arguments forwarded to
                :meth:`build_command` (e.g. ``wordlist``, ``extensions``,
                ``filter_size``).

        Returns:
            A :class:`JobResult` containing raw output and parsed data.
        """
        return await self.run(url=url, **kwargs)
