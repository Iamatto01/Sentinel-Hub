"""
sentinel_ctf.tools.pwn.heap_tool
==================================
Heap analysis plugin using pwndbg heap / bins commands inside GDB.

Runs GDB in batch mode with pwndbg-specific commands (``heap``, ``bins``,
``vis_heap_chunks``) to capture heap layout, bin contents, and freed chunks
— essential for heap exploitation challenges.
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

# Regex patterns for pwndbg heap output
_CHUNK_LINE_RE = re.compile(
    r"(?:chunk|Chunk)\s+(?:at\s+)?(?P<addr>0x[0-9a-fA-F]+)",
    re.IGNORECASE,
)
_BIN_HEADER_RE = re.compile(
    r"(?P<bin_type>fastbins|smallbins|largebins|unsortedbin|tcachebins)"
    r"\s*(?:\[.*?\])?",
    re.IGNORECASE,
)
_BIN_ENTRY_RE = re.compile(r"(0x[0-9a-fA-F]+)")
_FREED_RE = re.compile(r"(?:free|PREV_INUSE\s*=\s*0)", re.IGNORECASE)


class HeapTool(BaseTool):
    """
    Analyses heap state using pwndbg commands executed inside GDB batch mode.

    The *gdb_script* parameter is a semicolon-separated list of GDB/pwndbg
    commands that are each translated into ``-ex`` arguments.
    """

    name: str = "heap"
    description: str = "Heap analysis via pwndbg heap/bins commands in GDB"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        binary: str,
        gdb_script: str = "heap;bins;vis_heap_chunks",
        input_data: str = "",
        timeout: int = 30,
        **kwargs: Any,
    ) -> str:
        """
        Build the GDB batch command with heap-analysis commands.

        Parameters
        ----------
        binary:
            Path to the ELF binary to debug.
        gdb_script:
            Semicolon-separated GDB/pwndbg commands.  Each token becomes
            a separate ``-ex`` argument.
        input_data:
            Optional stdin data piped to the binary.
        timeout:
            Maximum wall-clock seconds before ``timeout`` kills GDB.

        Returns
        -------
        str
            Shell command string.
        """
        binary_q = shlex.quote(binary)

        # Build -ex sequence: file <binary>, run, then each script command
        script_cmds = [cmd.strip() for cmd in gdb_script.split(";") if cmd.strip()]
        all_cmds = [f"file {binary}", "run"] + script_cmds

        ex_flags = " ".join(f"-ex {shlex.quote(cmd)}" for cmd in all_cmds)
        gdb_cmd = (
            f"timeout {timeout} gdb -q -batch {ex_flags} {binary_q} 2>&1"
        )

        if input_data:
            return f"echo {shlex.quote(input_data)} | {gdb_cmd}"
        return gdb_cmd

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse pwndbg heap-command output into structured heap state.

        Returns
        -------
        dict with keys:

        * ``chunks`` – list of chunk info strings from the output
        * ``bins`` – dict of bin_type → list of address strings
        * ``freed_chunks`` – list of lines suggesting freed chunks
        * ``flags_found`` – CTF flags spotted in output
        """
        stdout = result.stdout or ""
        combined = stdout + "\n" + (result.stderr or "")

        # Heap chunks
        chunks: list[str] = []
        for m in _CHUNK_LINE_RE.finditer(combined):
            # Grab the full line around the match for context
            start = combined.rfind("\n", 0, m.start()) + 1
            end = combined.find("\n", m.end())
            if end == -1:
                end = len(combined)
            chunk_line = combined[start:end].strip()
            if chunk_line and chunk_line not in chunks:
                chunks.append(chunk_line)

        # Bins
        bins: dict[str, list[str]] = {}
        current_bin: str | None = None
        for line in combined.splitlines():
            bh = _BIN_HEADER_RE.match(line.strip())
            if bh:
                current_bin = bh.group("bin_type").lower()
                bins.setdefault(current_bin, [])
                continue
            if current_bin is not None:
                addrs = _BIN_ENTRY_RE.findall(line)
                bins[current_bin].extend(addrs)

        # Freed chunks (heuristic)
        freed_chunks = [
            line.strip()
            for line in combined.splitlines()
            if _FREED_RE.search(line)
        ]

        # Flags
        flags_found: list[str] = []
        for flag_m in _FLAG_RE.finditer(combined):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        return {
            "chunks": chunks,
            "bins": bins,
            "freed_chunks": freed_chunks,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def analyze(self, binary: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        binary:
            Path to the target ELF binary.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(binary=binary, **kwargs)
