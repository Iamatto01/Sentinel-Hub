"""strings_tool.py — Extract printable strings and file metadata from a binary.

Wraps the UNIX ``file`` and ``strings`` utilities.  Interesting strings
heuristic covers URLs, filesystem paths, environment variable keys,
common crypto/key markers, and flag-format patterns.
"""

from __future__ import annotations

import re
from os.path import basename
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# ---------------------------------------------------------------------------
# Heuristic patterns for "interesting" strings (non-flag)
# ---------------------------------------------------------------------------
_URL_RE = re.compile(r'https?://\S+', re.IGNORECASE)
_PATH_RE = re.compile(r'(?:/[\w.\-]+){2,}')
_ENV_KEY_RE = re.compile(r'\b[A-Z_]{3,}=\S+')
_CRYPTO_RE = re.compile(
    r'\b(?:BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY|SECRET|PASSWORD|TOKEN|API_KEY|PASSWD|PRIVATE)\b',
    re.IGNORECASE,
)
_BASE64_RE = re.compile(r'[A-Za-z0-9+/]{32,}={0,2}')

_INTERESTING_PATTERNS: list[re.Pattern[str]] = [
    _URL_RE,
    _PATH_RE,
    _ENV_KEY_RE,
    _CRYPTO_RE,
    _BASE64_RE,
]

# Default flag regex – matches flag{…}, CTF{…}, etc.
_DEFAULT_FLAG_RE = re.compile(r'flag\{[^}]+\}', re.IGNORECASE)


class StringsTool(BaseTool):
    """Extract printable strings and file info from a binary.

    Parameters
    ----------
    executor:
        A :class:`~sentinel_ctf.executor.base.BaseExecutor` instance used to
        run remote or local commands.
    """

    name: str = "strings"
    description: str = "Extract printable strings from a binary"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        min_length: int = 8,
        flag_regex: str = r"flag\{[^}]+\}",  # noqa: W605 (raw string)
    ) -> str:
        """Build the shell command that collects file info and strings.

        Parameters
        ----------
        filepath:
            Absolute (or relative) path to the binary on the executor host.
        min_length:
            Minimum printable-string length passed to ``strings -n``.
        flag_regex:
            Flag pattern (unused in the shell command; kept for API symmetry
            — actual regex scanning happens in :meth:`parse`).

        Returns
        -------
        str
            A single ``bash -c '…'`` command string.
        """
        # Escape single-quotes in filepath so the bash -c wrapper stays valid.
        safe_path = filepath.replace("'", r"'\''")
        return (
            f"bash -c 'file {safe_path}; "
            f'echo "=== STRINGS ==="; '
            f"strings -n {min_length} {safe_path}'"
        )

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult, flag_regex: str = r"flag\{[^}]+\}") -> dict[str, Any]:
        """Parse the combined ``file`` + ``strings`` output.

        Parameters
        ----------
        result:
            Raw execution result from the executor.
        flag_regex:
            Regex pattern used to scan for flags inside string output.

        Returns
        -------
        dict with keys:

        ``file_info``
            The first line of stdout (output of ``file``).
        ``strings``
            Full list of extracted strings.
        ``interesting``
            Subset of strings that match heuristic patterns (URLs, paths,
            keys, base64 blobs, etc.).
        ``flags_found``
            List of strings matching *flag_regex*.
        ``exit_code``
            Raw exit code from the executor.
        ``error``
            Stderr output, or empty string.
        """
        stdout: str = result.stdout or ""
        stderr: str = result.stderr or ""

        lines = stdout.splitlines()

        # --- file info: first line before the separator -----------------
        file_info = ""
        strings_lines: list[str] = []
        past_separator = False

        for line in lines:
            if not past_separator:
                if line.strip() == "=== STRINGS ===":
                    past_separator = True
                else:
                    # Collect everything before separator as file_info
                    if file_info:
                        file_info += "\n" + line
                    else:
                        file_info = line
            else:
                strings_lines.append(line)

        # --- interesting strings heuristic ------------------------------
        interesting: list[str] = []
        for s in strings_lines:
            for pattern in _INTERESTING_PATTERNS:
                if pattern.search(s):
                    interesting.append(s)
                    break  # avoid duplicates from multiple patterns

        # --- flag scan --------------------------------------------------
        try:
            compiled_flag_re = re.compile(flag_regex, re.IGNORECASE)
        except re.error:
            compiled_flag_re = _DEFAULT_FLAG_RE

        flags_found: list[str] = []
        for s in strings_lines:
            matches = compiled_flag_re.findall(s)
            flags_found.extend(matches)

        return {
            "file_info": file_info.strip(),
            "strings": strings_lines,
            "interesting": interesting,
            "flags_found": flags_found,
            "exit_code": result.exit_code,
            "error": stderr.strip(),
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def extract(
        self,
        filepath: str,
        min_length: int = 8,
        flag_regex: str = r"flag\{[^}]+\}",
        **kwargs: Any,
    ) -> JobResult:
        """Run strings extraction on *filepath* and return a :class:`JobResult`.

        Parameters
        ----------
        filepath:
            Path to the binary on the executor host.
        min_length:
            Minimum string length for ``strings -n``.
        flag_regex:
            Regex used to identify flags in the output.
        **kwargs:
            Forwarded to the underlying executor ``run`` call.

        Returns
        -------
        JobResult
            Structured result including parsed data and any flags found.
        """
        return await self.run(
            filepath=filepath,
            min_length=min_length,
            flag_regex=flag_regex,
            **kwargs,
        )
