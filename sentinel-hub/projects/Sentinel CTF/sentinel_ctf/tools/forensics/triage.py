"""
Forensics triage tool plugin for the Sentinel CTF Framework.

Runs multiple quick reconnaissance commands against a target file in a single
bash invocation and aggregates the results into a structured dictionary.
"""

from __future__ import annotations

import re
import shlex
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# ---------------------------------------------------------------------------
# Section header constants – must match the echo separators in build_command
# ---------------------------------------------------------------------------
_SEP_FILE = "=== FILE ==="
_SEP_STRINGS = "=== STRINGS ==="
_SEP_EXIFTOOL = "=== EXIFTOOL ==="
_SEP_BINWALK = "=== BINWALK ==="
_SEP_HEX = "=== HEX ==="

_DEFAULT_FLAG_REGEX = r"flag\{[^}]+\}"


class TriageTool(BaseTool):
    """Multi-tool file triage: file, strings, exiftool, binwalk."""

    name: str = "triage"
    description: str = "Multi-tool file triage: file, strings, exiftool, binwalk"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        flag_regex: str = _DEFAULT_FLAG_REGEX,  # noqa: ARG002 – stored for parse()
    ) -> str:
        """Return a single ``bash -c '...'`` command that performs file triage.

        The compound command runs:

        1. ``file <filepath>``
        2. ``strings -n 8 <filepath> | head -200``
        3. ``exiftool <filepath>`` (graceful fallback if not installed)
        4. ``binwalk <filepath>`` (graceful fallback if not installed)
        5. ``xxd <filepath> | head -30``

        Each section is delimited by an echo separator so :meth:`parse` can
        split the output reliably.

        Args:
            filepath: Absolute or relative path to the file to triage.
            flag_regex: Flag pattern used later by :meth:`parse`.  The regex
                is *not* embedded in the shell command; it is applied by the
                Python parser so it can be changed without rebuilding the cmd.

        Returns:
            A shell command string ready to be forwarded to the executor.
        """
        # Store so that parse() can reuse it without the caller passing it again
        self._flag_regex = flag_regex

        safe = shlex.quote(filepath)

        inner = (
            f"echo '{_SEP_FILE}' && "
            f"file {safe} && "
            f"echo '{_SEP_STRINGS}' && "
            f"strings -n 8 {safe} | head -200 && "
            f"echo '{_SEP_EXIFTOOL}' && "
            f"(exiftool {safe} 2>/dev/null || echo 'exiftool not available') && "
            f"echo '{_SEP_BINWALK}' && "
            f"(binwalk {safe} 2>/dev/null || echo 'binwalk not available') && "
            f"echo '{_SEP_HEX}' && "
            f"xxd {safe} | head -30"
        )
        return f"bash -c {shlex.quote(inner)}"

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse the aggregated triage output into a structured dictionary.

        The method splits the raw stdout on the ``=== ... ===`` section
        markers produced by :meth:`build_command` and extracts:

        * **file_type** – the type string reported by ``file(1)``.
        * **strings_sample** – first 20 non-empty strings from ``strings(1)``.
        * **metadata** – key/value pairs from exiftool output.
        * **binwalk_signatures** – list of signature description lines from
          binwalk output (skips the header row and empty lines).
        * **flags_found** – all regex matches found across the entire stdout.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult` returned
                by the executor after running :meth:`build_command`'s output.

        Returns:
            A dictionary with the keys described above.
        """
        stdout: str = result.stdout or ""
        flag_regex: str = getattr(self, "_flag_regex", _DEFAULT_FLAG_REGEX)

        # --- Split into named sections -----------------------------------
        sections: dict[str, str] = {}
        markers = [_SEP_FILE, _SEP_STRINGS, _SEP_EXIFTOOL, _SEP_BINWALK, _SEP_HEX]
        # Build a regex that splits on any of the markers
        split_pattern = "|".join(re.escape(m) for m in markers)
        parts = re.split(split_pattern, stdout)
        # parts[0] is anything before the first marker (usually empty)
        # parts[1..] correspond to sections in order
        for idx, marker in enumerate(markers):
            sections[marker] = parts[idx + 1].strip() if idx + 1 < len(parts) else ""

        # --- file_type ---------------------------------------------------
        file_lines = sections[_SEP_FILE].splitlines()
        if file_lines:
            # "filename: <type description>" → grab everything after the first ':'
            first_line = file_lines[0]
            file_type = first_line.split(":", 1)[1].strip() if ":" in first_line else first_line.strip()
        else:
            file_type = ""

        # --- strings_sample ----------------------------------------------
        strings_sample = [
            ln.strip()
            for ln in sections[_SEP_STRINGS].splitlines()
            if ln.strip()
        ][:20]

        # --- metadata (exiftool) ----------------------------------------
        metadata: dict[str, str] = {}
        for line in sections[_SEP_EXIFTOOL].splitlines():
            if ":" in line and "exiftool not available" not in line:
                key, _, value = line.partition(":")
                metadata[key.strip()] = value.strip()

        # --- binwalk_signatures ------------------------------------------
        binwalk_signatures: list[str] = []
        for line in sections[_SEP_BINWALK].splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            # Skip the column header line produced by binwalk
            if stripped.startswith("DECIMAL") or stripped.startswith("-"):
                continue
            if "binwalk not available" in stripped:
                continue
            binwalk_signatures.append(stripped)

        # --- flags_found (scan entire stdout) ----------------------------
        flags_found: list[str] = re.findall(flag_regex, stdout)

        return {
            "file_type": file_type,
            "strings_sample": strings_sample,
            "metadata": metadata,
            "binwalk_signatures": binwalk_signatures,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Convenience shortcut
    # ------------------------------------------------------------------

    async def triage(self, filepath: str, **kwargs: Any) -> JobResult:
        """High-level shortcut: build command, execute, parse, and return a :class:`JobResult`.

        Args:
            filepath: Path to the file to triage.
            **kwargs: Extra keyword arguments forwarded to :meth:`build_command`
                (e.g. ``flag_regex``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` containing the
            parsed triage dictionary as its ``data`` payload.
        """
        flag_regex: str = kwargs.pop("flag_regex", _DEFAULT_FLAG_REGEX)
        command = self.build_command(filepath, flag_regex=flag_regex)
        exec_result: ExecResult = await self.executor.run(command, **kwargs)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            raw=exec_result,
            data=parsed,
            success=exec_result.returncode == 0,
        )
