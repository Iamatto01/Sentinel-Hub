"""Steghide wrapper tool for steganography extraction in CTF challenges."""

import os
import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

# Regex patterns for flag detection
_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)
_EXTRACT_SUCCESS_RE = re.compile(
    r'wrote extracted data to\s+"?([^\s"]+)"?',
    re.IGNORECASE,
)


class SteghideTool(BaseTool):
    """Steganography extraction tool using the ``steghide`` command-line utility.

    Wraps ``steghide extract`` to pull hidden data from image and audio
    carriers (JPEG, BMP, WAV, AU).  Supports passphrase-protected extractions
    and automatically scans the extracted content for CTF flag patterns.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "steghide"
    description: str = "Steganography extraction with steghide"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        passphrase: str = "",
        extract_dir: str = "/tmp",
    ) -> str:
        """Build the ``steghide extract`` shell command.

        Args:
            filepath: Absolute or relative path to the carrier file.
            passphrase: Passphrase used to protect the hidden payload.
                An empty string attempts extraction without a passphrase.
            extract_dir: Directory where the extracted file will be written.
                Defaults to ``/tmp``.

        Returns:
            A shell command string ready for execution, with stderr merged
            into stdout (``2>&1``) so the executor captures all output.
        """
        basename = os.path.splitext(os.path.basename(filepath))[0]
        output_path = f"{extract_dir}/steghide_out_{basename}"
        return (
            f"steghide extract -sf {filepath} -p {passphrase!r} "
            f"-xf {output_path} -f 2>&1"
        )

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse ``steghide`` output into a structured result dictionary.

        Examines the combined stdout/stderr captured by the executor to
        determine whether extraction succeeded, locate the output file,
        and scan both the tool output and any extracted file content for
        CTF flag patterns.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor after running the command.

        Returns:
            A dictionary with the following keys:

            * ``extracted_file`` (*str | None*): Absolute path to the
              extracted payload file, or ``None`` if extraction failed.
            * ``success`` (*bool*): ``True`` when steghide reported a
              successful extraction.
            * ``flags_found`` (*list[str]*): Unique CTF flag strings
              discovered in steghide output or the extracted file.
            * ``raw_output`` (*str*): The raw combined output captured by
              the executor.
        """
        output: str = result.stdout or ""
        success = False
        extracted_file: str | None = None
        flags_found: list[str] = []

        # Determine success and captured file path
        match = _EXTRACT_SUCCESS_RE.search(output)
        if match:
            success = True
            extracted_file = match.group(1).strip()

        # Fallback: steghide may just say "wrote extracted data to"
        if not success and "wrote extracted data to" in output.lower():
            success = True

        # Also accept zero exit-code as success indicator
        if result.returncode == 0:
            success = True

        # Scan tool output for flags
        flags_found.extend(_FLAG_PATTERN.findall(output))

        # Scan the extracted file for flags if it exists
        if extracted_file and os.path.isfile(extracted_file):
            try:
                with open(extracted_file, "r", errors="replace") as fh:
                    file_content = fh.read()
                flags_found.extend(_FLAG_PATTERN.findall(file_content))
            except OSError:
                pass

        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "extracted_file": extracted_file,
            "success": success,
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def extract(self, filepath: str, **kwargs: Any) -> JobResult:
        """Run steghide extraction and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine that combines :meth:`build_command`,
        executor dispatch, and :meth:`parse` in a single call.

        Args:
            filepath: Path to the carrier image or audio file.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``passphrase``, ``extract_dir``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed extraction dictionary.
        """
        command = self.build_command(filepath, **kwargs)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
