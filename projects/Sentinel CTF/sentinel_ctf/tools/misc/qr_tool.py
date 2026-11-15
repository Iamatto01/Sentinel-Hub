"""QR code and barcode decoder tool for CTF misc challenges."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)


class QrTool(BaseTool):
    """QR code and barcode decoder using ``zbarimg`` with a ``pyzbar`` fallback.

    Attempts decoding via the ``zbarimg`` command-line utility first (faster,
    handles many barcode formats).  If ``zbarimg`` is unavailable, a Python
    one-liner using the ``pyzbar`` and ``PIL`` libraries is used as a
    drop-in fallback so the tool remains functional in environments where
    only Python dependencies are installed.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "qr"
    description: str = "QR code and barcode decoder"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(self, filepath: str) -> str:
        """Build the barcode decoding shell command.

        The command tries ``zbarimg --raw`` first; if that fails (non-zero
        exit or not installed) it falls through to a Python one-liner that
        uses ``pyzbar`` + ``PIL``.

        Args:
            filepath: Path to the image file containing the barcode or QR
                code (PNG, JPEG, GIF, etc.).

        Returns:
            A shell command string with a ``||`` fallback chain so the
            executor always has a best-effort decoding attempt.
        """
        pyzbar_oneliner = (
            f"python3 -c \""
            f"from PIL import Image; "
            f"from pyzbar.pyzbar import decode; "
            f"[print(d.data.decode()) for d in decode(Image.open('{filepath}'))]\""
        )
        return f"zbarimg --raw {filepath} 2>/dev/null || {pyzbar_oneliner}"

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse barcode decoder output into a list of decoded strings.

        Each non-empty line of output is treated as a distinct decoded
        symbol.  Duplicate lines (arising from multi-format sweeps) are
        deduplicated.  All decoded values and the raw output are scanned
        for CTF flag patterns.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor after running the decode command.

        Returns:
            A dictionary with the following keys:

            * ``decoded`` (*list[str]*): Unique strings decoded from the
              image (one entry per detected barcode symbol).
            * ``flags_found`` (*list[str]*): CTF flag strings identified
              in the decoded output.
            * ``raw_output`` (*str*): Raw verbatim decoder output.
        """
        output: str = result.stdout or ""
        decoded: list[str] = []
        flags_found: list[str] = []

        seen: set[str] = set()
        for line in output.splitlines():
            value = line.strip()
            if value and value not in seen:
                seen.add(value)
                decoded.append(value)

        # Scan decoded values and raw output for flags
        for value in decoded:
            flags_found.extend(_FLAG_PATTERN.findall(value))
        flags_found.extend(_FLAG_PATTERN.findall(output))

        seen_flags: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen_flags:
                seen_flags.add(flag)
                unique_flags.append(flag)

        return {
            "decoded": decoded,
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def decode(self, filepath: str, **kwargs: Any) -> JobResult:
        """Decode a barcode/QR image and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` in a single awaitable call.

        Args:
            filepath: Path to the image file to decode.
            **kwargs: Accepted for interface uniformity; not forwarded to
                :meth:`build_command` (the command takes no extra parameters).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed decoding dictionary.
        """
        command = self.build_command(filepath)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
