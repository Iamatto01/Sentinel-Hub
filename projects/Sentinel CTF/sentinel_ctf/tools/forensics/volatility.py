"""
Volatility 3 memory forensics tool plugin for the Sentinel CTF Framework.

Wraps the ``python3 -m volatility3`` CLI and parses the tabular text output
into structured Python dictionaries.
"""

from __future__ import annotations

import re
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

_DEFAULT_PLUGIN = "windows.pslist.PsList"
_DEFAULT_FLAG_REGEX = r"flag\{[^}]+\}"

# Minimum number of columns a header line must have to be considered tabular
_MIN_HEADER_COLS = 2


class VolatilityTool(BaseTool):
    """Memory forensics tool wrapping Volatility 3."""

    name: str = "volatility3"
    description: str = "Memory forensics"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        image: str,
        plugin: str = _DEFAULT_PLUGIN,
        output_format: str = "text",
        extra_flags: str = "",
    ) -> str:
        """Build the Volatility 3 CLI invocation string.

        The generated command takes the form::

            python3 -m volatility3 -f <image> <plugin> [extra_flags]

        Args:
            image: Path to the memory image file.
            plugin: Fully-qualified Volatility 3 plugin name
                (e.g. ``"windows.pslist.PsList"``).
            output_format: Reserved for future use; Volatility 3 text output
                is the only mode currently parsed.  Defaults to ``"text"``.
            extra_flags: Any additional CLI flags appended verbatim after the
                plugin name (e.g. ``"--pid 1234"``).

        Returns:
            A shell command string suitable for the executor.
        """
        # Store plugin name so parse() can attach it to the result
        self._current_plugin = plugin

        parts = ["python3", "-m", "volatility3", "-f", image, plugin]
        if extra_flags:
            parts.append(extra_flags.strip())
        return " ".join(parts)

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse Volatility 3 tabular text output into a structured dictionary.

        The method detects the header row (the first line that contains at
        least :data:`_MIN_HEADER_COLS` whitespace-delimited tokens and does not
        start with ``*`` or ``Progress``), then treats every subsequent
        non-empty line as a data row.

        Args:
            result: :class:`~sentinel_ctf.executor.base.ExecResult` from the
                executor.

        Returns:
            A dictionary with the following keys:

            * ``plugin`` (*str*) – name of the Volatility plugin that was run.
            * ``rows`` (*list[dict]*) – each row is a dict mapping column
              headers to cell values.  Excess columns are bundled under the
              last header key.
            * ``total_rows`` (*int*) – number of data rows parsed.
            * ``flags_found`` (*list[str]*) – all flag-pattern matches found in
              the raw stdout.
        """
        stdout: str = result.stdout or ""
        plugin: str = getattr(self, "_current_plugin", "unknown")
        flag_regex: str = getattr(self, "_flag_regex", _DEFAULT_FLAG_REGEX)

        # --- Flag scan across raw output ---------------------------------
        flags_found: list[str] = re.findall(flag_regex, stdout)

        # --- Parse tabular output ----------------------------------------
        lines = stdout.splitlines()

        headers: list[str] = []
        rows: list[dict[str, str]] = []
        header_found = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # Skip Volatility progress / informational lines
            if stripped.startswith(("*", "Volatility", "Progress", "Stacking")):
                continue

            tokens = stripped.split()

            if not header_found:
                # Heuristic: the first eligible multi-token line is the header
                if len(tokens) >= _MIN_HEADER_COLS:
                    headers = tokens
                    header_found = True
                continue

            # Skip separator lines (e.g. "--------")
            if re.match(r"^[-\s]+$", stripped):
                continue

            # Map tokens → header keys; last header absorbs any overflow
            row: dict[str, str] = {}
            for col_idx, header in enumerate(headers):
                if col_idx < len(headers) - 1:
                    row[header] = tokens[col_idx] if col_idx < len(tokens) else ""
                else:
                    # Last column: join remaining tokens (handles columns with spaces)
                    row[header] = " ".join(tokens[col_idx:]) if col_idx < len(tokens) else ""
            rows.append(row)

        return {
            "plugin": plugin,
            "rows": rows,
            "total_rows": len(rows),
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Convenience shortcut
    # ------------------------------------------------------------------

    async def run_plugin(self, image: str, plugin: str, **kwargs: Any) -> JobResult:
        """High-level shortcut: build command, execute, parse, and return a :class:`JobResult`.

        Args:
            image: Path to the memory image file.
            plugin: Fully-qualified Volatility 3 plugin name.
            **kwargs: Extra keyword arguments forwarded to
                :meth:`build_command` (e.g. ``extra_flags``, ``output_format``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` containing the
            structured parsed data as its ``data`` payload.
        """
        output_format: str = kwargs.pop("output_format", "text")
        extra_flags: str = kwargs.pop("extra_flags", "")
        flag_regex: str = kwargs.pop("flag_regex", _DEFAULT_FLAG_REGEX)

        # Store regex so parse() can use it
        self._flag_regex = flag_regex

        command = self.build_command(
            image,
            plugin=plugin,
            output_format=output_format,
            extra_flags=extra_flags,
        )
        exec_result: ExecResult = await self.executor.run(command, **kwargs)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            raw=exec_result,
            data=parsed,
            success=exec_result.returncode == 0,
        )
