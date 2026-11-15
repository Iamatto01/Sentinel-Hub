"""Zsteg wrapper tool for PNG/BMP LSB steganography analysis."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# zsteg output line pattern:  b1,rgb,lsb,xy .. text: "some data"
_ZSTEG_LINE_RE = re.compile(
    r'^(?P<channel>\S+)\s+\.\.\s+(?P<type>\w+(?::\s*\w+)?)\s*:\s+(?P<data>.+)$'
)


class ZstegTool(BaseTool):
    """LSB steganography analysis tool wrapping ``zsteg`` for PNG/BMP images.

    ``zsteg`` probes every combination of bit-plane, channel, and byte order
    to detect hidden data in PNG and BMP images.  This wrapper exposes the
    full channel sweep (``-a``) and parses every reported finding, flagging
    any entry that matches known CTF flag patterns.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "zsteg"
    description: str = "PNG/BMP LSB steganography analysis"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        all_channels: bool = True,
        extra_flags: str = "",
    ) -> str:
        """Build the ``zsteg`` shell command.

        Args:
            filepath: Path to the PNG or BMP image file to analyse.
            all_channels: When ``True`` (the default), passes ``-a`` to
                enable all-channel scanning.  This is slower but thorough.
            extra_flags: Any additional raw flags to insert before the
                filepath (e.g. ``"--bits 2"``).

        Returns:
            A shell command string that redirects stderr into stdout so
            that the executor captures diagnostic messages alongside
            findings.
        """
        all_flag = "-a" if all_channels else ""
        parts = ["zsteg", all_flag, extra_flags, filepath, "2>&1"]
        # Collapse multiple spaces that result from empty optional parts
        return " ".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse ``zsteg`` output into structured findings.

        Each line of ``zsteg`` output that matches the expected format
        ``<channel> .. <type>: <data>`` is turned into a finding dict.
        All findings and the raw output are scanned for CTF flag patterns.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                returned by the executor.

        Returns:
            A dictionary with the following keys:

            * ``findings`` (*list[dict]*): Each entry has:
              - ``channel`` (*str*): The zsteg channel descriptor
                (e.g. ``"b1,rgb,lsb,xy"``).
              - ``data_type`` (*str*): The detected data type
                (e.g. ``"text"``).
              - ``data_snippet`` (*str*): The first 200 chars of the
                decoded data for that channel.
            * ``flags_found`` (*list[str]*): Unique CTF flag strings
              discovered across all findings and the raw output.
            * ``raw_output`` (*str*): Full verbatim output from zsteg.
        """
        output: str = result.stdout or ""
        findings: list[dict] = []
        flags_found: list[str] = []

        for line in output.splitlines():
            line_stripped = line.strip()
            if not line_stripped:
                continue

            m = _ZSTEG_LINE_RE.match(line_stripped)
            if m:
                channel = m.group("channel")
                data_type = m.group("type")
                data_snippet = m.group("data").strip()[:200]
                findings.append(
                    {
                        "channel": channel,
                        "data_type": data_type,
                        "data_snippet": data_snippet,
                    }
                )
                # Scan this finding for flags
                flags_found.extend(_FLAG_PATTERN.findall(data_snippet))

        # Also scan the entire raw output for flags that may appear
        # outside of a cleanly-formatted line (e.g. binary blob printout)
        flags_found.extend(_FLAG_PATTERN.findall(output))

        # Deduplicate while preserving first-seen order
        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "findings": findings,
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def analyze(self, filepath: str, **kwargs: Any) -> JobResult:
        """Run zsteg analysis and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine that combines :meth:`build_command`,
        executor dispatch, and :meth:`parse` in a single call.

        Args:
            filepath: Path to the PNG or BMP image to analyse.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``all_channels``, ``extra_flags``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed findings dictionary.
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
