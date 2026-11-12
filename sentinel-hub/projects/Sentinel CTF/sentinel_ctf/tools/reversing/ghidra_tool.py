"""Ghidra headless disassembly and decompilation tool for CTF binary reversing."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# Ghidra headless INFO log lines: "INFO  <message> (GhidraScript)"
_INFO_LINE_RE = re.compile(r'INFO\s+(.+?)(?:\s*\(.*\))?\s*$')
# Function name lines emitted by common Ghidra scripts
_FUNCTION_RE = re.compile(r'(?:Function|FUNCTION):\s*(.+)', re.IGNORECASE)


class GhidraTool(BaseTool):
    """Ghidra headless analysis tool for binary disassembly and decompilation.

    Invokes Ghidra's ``analyzeHeadless`` in batch mode, importing the target
    binary, running a post-analysis script, and deleting the temporary
    project afterwards.  Includes a glob-based fallback for installations
    where the Ghidra version number is embedded in the directory name.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "ghidra"
    description: str = "Ghidra headless disassembly and decompilation"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        binary: str,
        project_dir: str = "/tmp/ghidra_proj",
        script: str = "",
    ) -> str:
        """Build the Ghidra headless analyser shell command.

        When no custom script is given, the tool defaults to
        ``PrintStrings.java`` and also appends a glob-based fallback for
        installations located at ``/opt/ghidra_*/`` so the command works
        across different Ghidra version directories.

        Args:
            binary: Absolute path to the binary to import and analyse.
            project_dir: Directory where Ghidra should create its temporary
                project.  Defaults to ``/tmp/ghidra_proj``.
            script: Name of the Ghidra post-script to run (e.g.
                ``"DecompileAllFunctions.java"``).  When empty, defaults to
                ``"PrintStrings.java"`` with an additional glob fallback.

        Returns:
            A shell command string, potentially containing a ``||`` fallback
            for alternative Ghidra installation paths.
        """
        effective_script = script if script else "PrintStrings.java"

        primary = (
            f"/opt/ghidra/support/analyzeHeadless {project_dir} CTFProject "
            f"-import {binary} "
            f"-postScript {effective_script} "
            f"-deleteProject 2>/dev/null"
        )

        if script:
            # Custom script provided: single command, no fallback needed
            return primary

        # Default PrintStrings.java path: add glob fallback for versioned dirs
        glob_fallback = (
            f"|| /opt/ghidra_*/support/analyzeHeadless {project_dir} CTFProject "
            f"-import {binary} "
            f"-postScript {effective_script} "
            f"-deleteProject 2>/dev/null"
        )
        return f"{primary} {glob_fallback}"

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse Ghidra headless output into structured analysis data.

        Extracts string literals reported via INFO log lines, function names
        from ``Function:`` / ``FUNCTION:`` markers, and scans the entire
        output for CTF flag patterns.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor after running the Ghidra command.

        Returns:
            A dictionary with the following keys:

            * ``strings_found`` (*list[str]*): String literals extracted from
              Ghidra's INFO-level log lines.
            * ``functions`` (*list[str]*): Function names identified in the
              output via ``Function:`` / ``FUNCTION:`` markers.
            * ``flags_found`` (*list[str]*): CTF flag strings discovered
              anywhere in the output.
            * ``raw_output`` (*str*): Raw verbatim Ghidra headless output.
        """
        output: str = result.stdout or ""
        strings_found: list[str] = []
        functions: list[str] = []
        flags_found: list[str] = []

        for line in output.splitlines():
            line_s = line.strip()
            if not line_s:
                continue

            # Capture function markers first (specific match)
            func_m = _FUNCTION_RE.search(line_s)
            if func_m:
                func_name = func_m.group(1).strip()
                if func_name and func_name not in functions:
                    functions.append(func_name)
                continue

            # Capture INFO log content (general strings)
            info_m = _INFO_LINE_RE.search(line_s)
            if info_m:
                info_text = info_m.group(1).strip()
                if info_text and info_text not in strings_found:
                    strings_found.append(info_text)

        # Scan entire output for flags
        flags_found.extend(_FLAG_PATTERN.findall(output))

        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "strings_found": strings_found,
            "functions": functions,
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def decompile(self, binary: str, **kwargs: Any) -> JobResult:
        """Run Ghidra headless analysis and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` in a single awaitable call.

        Args:
            binary: Path to the binary to import and analyse.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``project_dir``, ``script``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed decompilation dictionary.
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
