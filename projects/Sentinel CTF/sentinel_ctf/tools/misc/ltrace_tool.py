"""
sentinel_ctf.tools.misc.ltrace_tool
======================================
Library call tracer plugin wrapping ``ltrace``.

Traces library function calls (``strcmp``, ``memcmp``, ``strcpy``, etc.)
to expose license checks, password comparisons, and other interesting
string operations in a binary.
"""
from __future__ import annotations

import re
import shlex
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)

# Match ltrace output lines:
#   strcmp("user_input", "correct_password") = 0
#   fopen("/etc/passwd", "r") = 0x561234
_LTRACE_LINE_RE = re.compile(
    r"^(?P<func>[a-zA-Z_][a-zA-Z0-9_@]*)\s*"
    r"\((?P<args_raw>[^)]*)\)"
    r"\s*=\s*(?P<return_val>\S+)"
)

# Comparison functions we pay extra attention to
_COMPARISON_FUNCS = frozenset({"strcmp", "strncmp", "memcmp", "strncasecmp", "strcasecmp"})

# Printable string extractor from args
_QUOTED_STRING_RE = re.compile(r'"([^"\\]*(?:\\.[^"\\]*)*)"')


def _extract_strings(args_raw: str) -> list[str]:
    """Extract all double-quoted string literals from an ltrace argument list."""
    return _QUOTED_STRING_RE.findall(args_raw)


class LtraceTool(BaseTool):
    """
    Traces library calls in a binary using ``ltrace``.

    Particularly useful for:

    * Finding hardcoded passwords/keys via ``strcmp`` / ``memcmp`` calls
    * Observing file access patterns
    * Spotting hidden checks in crackme / license-checker binaries
    """

    name: str = "ltrace"
    description: str = "Library call tracer — find strcmp, memcmp, license checks"

    # Default set of functions to trace
    _DEFAULT_TRACE_FUNCS: str = (
        "strcmp,strncmp,memcmp,strcpy,strdup,printf,puts,fopen,fread,fgets"
    )

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        binary: str,
        args: str = "",
        input_data: str = "",
        timeout: int = 10,
        trace_funcs: str = _DEFAULT_TRACE_FUNCS,
        **kwargs: Any,
    ) -> str:
        """
        Build the ``ltrace`` command.

        Parameters
        ----------
        binary:
            Path to the binary to trace.
        args:
            Command-line arguments to pass to *binary*.
        input_data:
            Optional stdin data to feed to the binary (via ``<<<``).
        timeout:
            Maximum seconds before ``timeout`` kills ltrace.
        trace_funcs:
            Comma-separated list of library functions to trace (``-e``).

        Returns
        -------
        str
            Shell command string.
        """
        binary_q = shlex.quote(binary)
        cmd_parts = [
            f"timeout {timeout}",
            "ltrace",
            f"-e {trace_funcs}",
            "-s 200",
            binary_q,
        ]
        if args:
            cmd_parts.append(args)

        cmd = " ".join(cmd_parts) + " 2>&1"

        if input_data:
            cmd += f" <<< {shlex.quote(input_data)}"

        return cmd

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse ``ltrace`` output into structured call data.

        Returns
        -------
        dict with keys:

        * ``calls`` – list of ``{func, args_raw, return_val}``
        * ``comparisons`` – list of ``{func, lhs, rhs, return_val}`` for
          comparison functions
        * ``interesting_strings`` – unique printable strings seen as arguments
        * ``flags_found`` – CTF flags found in call arguments or output
        """
        stdout = result.stdout or ""
        combined = stdout + "\n" + (result.stderr or "")

        calls: list[dict[str, Any]] = []
        comparisons: list[dict[str, Any]] = []
        interesting_strings: list[str] = []
        flags_found: list[str] = []

        for line in combined.splitlines():
            m = _LTRACE_LINE_RE.match(line.strip())
            if not m:
                continue

            func = m.group("func")
            args_raw = m.group("args_raw")
            return_val = m.group("return_val")

            calls.append(
                {"func": func, "args_raw": args_raw, "return_val": return_val}
            )

            # Extract string arguments
            strings = _extract_strings(args_raw)
            for s in strings:
                if s and s not in interesting_strings:
                    interesting_strings.append(s)
                # Check for flags inside string args
                for flag_m in _FLAG_RE.finditer(s):
                    flag = flag_m.group(0)
                    if flag not in flags_found:
                        flags_found.append(flag)

            # Comparison functions
            if func in _COMPARISON_FUNCS and len(strings) >= 2:
                comparisons.append(
                    {
                        "func": func,
                        "lhs": strings[0],
                        "rhs": strings[1],
                        "return_val": return_val,
                    }
                )

        # Also scan the full combined output for flags
        for flag_m in _FLAG_RE.finditer(combined):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        return {
            "calls": calls,
            "comparisons": comparisons,
            "interesting_strings": interesting_strings,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def trace(self, binary: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        binary:
            Path to the binary to trace.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(binary=binary, **kwargs)
