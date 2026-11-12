"""
sentinel_ctf.tools.web.wfuzz
============================
Advanced web fuzzer plugin wrapping the ``wfuzz`` CLI tool.

Supports parameter fuzzing, header fuzzing, cookie fuzzing, and
common response-code/line/word filtering.
"""
from __future__ import annotations

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

# Regex to match a wfuzz output line, e.g.:
#   000000001:   200        12 L       45 W          234 Ch    "word"
_WFUZZ_LINE_RE = re.compile(
    r"^\s*\d+:\s+"          # entry number + colon
    r"(?P<code>\d+)\s+"     # HTTP status code
    r"(?P<lines>\d+)\s+L\s+"
    r"(?P<words>\d+)\s+W\s+"
    r"(?P<chars>\d+)\s+Ch\s+"
    r"\"(?P<payload>[^\"]*)\""
)

# Common flag patterns used across CTF platforms
_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)


class WfuzzTool(BaseTool):
    """
    Wraps the ``wfuzz`` CLI tool for web fuzzing.

    Supports hiding responses by status code (``-hc``), number of lines
    (``-hl``), or number of words (``-hw``).  If the ``FUZZ`` keyword is
    not already present in *url*, it is appended as a path segment
    (``/FUZZ``).
    """

    name: str = "wfuzz"
    description: str = "Advanced web fuzzer for parameters, headers, cookies"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        url: str,
        wordlist: str = "/usr/share/seclists/Discovery/Web-Content/common.txt",
        fuzz_keyword: str = "FUZZ",
        hide_code: str = "",
        hide_lines: str = "",
        hide_words: str = "",
        extra_flags: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Construct the ``wfuzz`` shell command string.

        Parameters
        ----------
        url:
            Target URL.  If *fuzz_keyword* is not present the keyword is
            appended as ``/{fuzz_keyword}``.
        wordlist:
            Path to the wordlist file passed to ``-w``.
        fuzz_keyword:
            Fuzzing placeholder (default ``FUZZ``).
        hide_code:
            Comma-separated HTTP status codes to hide (``-hc``).
        hide_lines:
            Comma-separated line counts to hide (``-hl``).
        hide_words:
            Comma-separated word counts to hide (``-hw``).
        extra_flags:
            Any additional raw flags appended verbatim.

        Returns
        -------
        str
            Ready-to-execute shell command.
        """
        if fuzz_keyword not in url:
            url = url.rstrip("/") + f"/{fuzz_keyword}"

        parts: list[str] = ["wfuzz", "-c", "-w", wordlist]

        if hide_code:
            parts += ["-hc", hide_code]
        if hide_lines:
            parts += ["-hl", hide_lines]
        if hide_words:
            parts += ["-hw", hide_words]
        if extra_flags:
            parts.append(extra_flags)

        parts.append(f'"{url}"')
        return " ".join(parts)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse wfuzz stdout into structured data.

        Returns
        -------
        dict with keys:

        * ``results`` – list of ``{code, lines, words, chars, payload}``
        * ``interesting`` – subset with 2xx / 3xx status codes
        * ``flags_found`` – any CTF flag strings spotted in the output
        """
        raw_results: list[dict[str, Any]] = []
        flags_found: list[str] = []

        combined_output = (result.stdout or "") + "\n" + (result.stderr or "")

        for line in combined_output.splitlines():
            m = _WFUZZ_LINE_RE.match(line)
            if m:
                entry: dict[str, Any] = {
                    "code": int(m.group("code")),
                    "lines": int(m.group("lines")),
                    "words": int(m.group("words")),
                    "chars": int(m.group("chars")),
                    "payload": m.group("payload"),
                }
                raw_results.append(entry)

            # Check the whole line for flags
            for flag_match in _FLAG_RE.finditer(line):
                flag = flag_match.group(0)
                if flag not in flags_found:
                    flags_found.append(flag)

        interesting = [r for r in raw_results if 200 <= r["code"] < 400]

        return {
            "results": raw_results,
            "interesting": interesting,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def fuzz(self, url: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        url:
            Target URL to fuzz.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(url=url, **kwargs)
