"""Radare2 binary analysis tool for CTF reversing challenges."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# afl output line: "0x00401060   1   52   main"
_AFL_LINE_RE = re.compile(r'^0x[0-9a-fA-F]+\s+\d+\s+\d+\s+(\S+)')

# iz / izz output line: "... vaddr=0x... ascii [N] string"
_IZ_LINE_RE = re.compile(r'ascii\s+\[\d+\]\s+(.+)$')

# ie entry point line: "vaddr=0x... paddr=0x... ... entry0"
_IE_LINE_RE = re.compile(r'vaddr=(0x[0-9a-fA-F]+)')


class Radare2Tool(BaseTool):
    """Radare2 binary analysis tool for static and dynamic CTF reversing.

    Runs radare2 in quiet batch mode (``-q -A``) executing a user-defined
    command string that typically combines analysis (``aaa``), function
    listing (``afl``), string extraction (``iz``), and entry-point lookup
    (``ie``).  The parser reconstructs structured data from the mixed
    radare2 output.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "r2"
    description: str = "Radare2 binary analysis"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        binary: str,
        commands: str = "aaa;afl;iz",
        extra_flags: str = "",
    ) -> str:
        """Build the radare2 batch-mode shell command.

        Args:
            binary: Absolute path to the binary to analyse.
            commands: Semicolon-separated list of radare2 commands to run
                in sequence.  Defaults to ``"aaa;afl;iz"`` which performs
                deep analysis, lists functions, and extracts strings.
            extra_flags: Additional raw flags to insert before the binary
                path (e.g. ``"-b 32"`` to force 32-bit mode).

        Returns:
            A shell command string that redirects stderr to ``/dev/null``
            and executes radare2 in quiet mode.
        """
        parts = ["r2", "-q", "-A", "-c", repr(commands), extra_flags, binary, "2>/dev/null"]
        return " ".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse radare2 output into structured reverse-engineering data.

        Processes the combined output of ``afl`` (function list), ``iz``
        (strings), and optionally ``ie`` (entry point) radare2 commands.
        Lines are classified by their format rather than by command section,
        which makes the parser robust to interleaved output.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor.

        Returns:
            A dictionary with the following keys:

            * ``functions`` (*list[str]*): Function names parsed from
              ``afl`` output (e.g. ``["main", "sym.check_flag"]``).
            * ``strings`` (*list[str]*): String literals parsed from
              ``iz`` / ``izz`` output.
            * ``entry_point`` (*str | None*): The virtual address of the
              binary's entry point extracted from ``ie`` output, or
              ``None`` if not present.
            * ``flags_found`` (*list[str]*): CTF flag strings identified
              anywhere in the output.
            * ``raw_output`` (*str*): Raw verbatim radare2 output.
        """
        output: str = result.stdout or ""
        functions: list[str] = []
        strings: list[str] = []
        entry_point: str | None = None
        flags_found: list[str] = []

        for line in output.splitlines():
            line_s = line.strip()
            if not line_s:
                continue

            # Function list (afl)
            afl_m = _AFL_LINE_RE.match(line_s)
            if afl_m:
                func_name = afl_m.group(1).strip()
                if func_name not in functions:
                    functions.append(func_name)
                continue

            # String list (iz / izz)
            iz_m = _IZ_LINE_RE.search(line_s)
            if iz_m:
                s = iz_m.group(1).strip()
                if s and s not in strings:
                    strings.append(s)
                continue

            # Entry point (ie)
            if "entry" in line_s.lower() and entry_point is None:
                ie_m = _IE_LINE_RE.search(line_s)
                if ie_m:
                    entry_point = ie_m.group(1)

        # Scan full output for flags
        flags_found.extend(_FLAG_PATTERN.findall(output))
        # Also scan parsed strings
        for s in strings:
            flags_found.extend(_FLAG_PATTERN.findall(s))

        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "functions": functions,
            "strings": strings,
            "entry_point": entry_point,
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def analyze(self, binary: str, **kwargs: Any) -> JobResult:
        """Run radare2 analysis and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` in a single awaitable call.

        Args:
            binary: Path to the binary to analyse.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``commands``, ``extra_flags``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed radare2 analysis dictionary.
        """
        command = self.build_command(binary, **kwargs)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
