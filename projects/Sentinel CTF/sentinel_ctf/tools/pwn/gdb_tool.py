"""
sentinel_ctf.tools.pwn.gdb_tool
=================================
GDB / pwndbg automation plugin.

Runs a binary under GDB in batch mode, capturing crash info, backtraces,
register state, and stack dumps useful for binary exploitation.
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

# Matches lines like:  rip  0x401234  0x401234 <main+12>
_REG_LINE_RE = re.compile(
    r"^\s*(?P<reg>[a-z0-9]+)\s+(?P<val>0x[0-9a-fA-F]+)", re.MULTILINE
)

# Matches GDB backtrace lines: #0  0x... in ...
_BT_LINE_RE = re.compile(r"^#\d+\s+", re.MULTILINE)

# Crash address extraction
_RIP_RE = re.compile(r"rip\s+(0x[0-9a-fA-F]+)", re.IGNORECASE)
_EIP_RE = re.compile(r"eip\s+(0x[0-9a-fA-F]+)", re.IGNORECASE)

# Cyclic offset extraction
_CYCLIC_FIND_RE = re.compile(r"cyclic_find\((0x[0-9a-fA-F]+)\)")


class GdbTool(BaseTool):
    """
    Automates GDB in batch mode for binary exploitation tasks.

    Runs the target binary, collects backtrace + registers + stack dump,
    and parses the output for crash details and CTF flags.
    """

    name: str = "gdb"
    description: str = "GDB/pwndbg automation — run scripts, get crash info, find offsets"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        binary: str,
        gdb_commands: str = "",
        input_data: str = "",
        timeout: int = 30,
        **kwargs: Any,
    ) -> str:
        """
        Build a GDB batch-mode command.

        Parameters
        ----------
        binary:
            Path to the ELF binary to debug.
        gdb_commands:
            Newline-separated additional GDB commands (``-ex`` lines).
        input_data:
            If provided, piped to the binary via stdin.
        timeout:
            Maximum seconds before ``timeout`` kills GDB.

        Returns
        -------
        str
            Shell command string.
        """
        base_ex = [
            "run",
            "bt",
            "info registers",
            "x/20gx $rsp",
        ]

        # Append caller-supplied commands
        extra_ex = [cmd.strip() for cmd in gdb_commands.splitlines() if cmd.strip()]
        all_ex = base_ex + extra_ex

        ex_flags = " ".join(f"-ex {shlex.quote(cmd)}" for cmd in all_ex)
        gdb_cmd = f"timeout {timeout} gdb -q -batch {ex_flags} {shlex.quote(binary)} 2>&1"

        if input_data:
            return f"echo {shlex.quote(input_data)} | {gdb_cmd}"
        return gdb_cmd

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse GDB batch-mode output into structured crash info.

        Returns
        -------
        dict with keys:

        * ``crash_address`` – hex string of rip/eip at crash, or ``None``
        * ``backtrace`` – list of backtrace frame lines
        * ``registers`` – dict of register name → hex value string
        * ``segfault`` – bool, ``True`` if a segfault was detected
        * ``flags_found`` – CTF flags found in output
        """
        stdout = result.stdout or ""
        stderr = result.stderr or ""
        combined = stdout + "\n" + stderr

        # Crash address
        crash_address: str | None = None
        m = _RIP_RE.search(combined)
        if m:
            crash_address = m.group(1)
        else:
            m = _EIP_RE.search(combined)
            if m:
                crash_address = m.group(1)

        # Backtrace lines
        backtrace = [
            line.strip()
            for line in combined.splitlines()
            if _BT_LINE_RE.match(line)
        ]

        # Registers
        registers: dict[str, str] = {}
        for rm in _REG_LINE_RE.finditer(combined):
            registers[rm.group("reg")] = rm.group("val")

        # Segfault detection
        segfault = (
            "sigsegv" in combined.lower()
            or "segmentation fault" in combined.lower()
            or result.return_code in (139, -11)
        )

        # Flags
        flags_found: list[str] = []
        for flag_m in _FLAG_RE.finditer(combined):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        return {
            "crash_address": crash_address,
            "backtrace": backtrace,
            "registers": registers,
            "segfault": segfault,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------

    @staticmethod
    def find_offset_from_core(cyclic_output: str) -> int | None:
        """
        Extract the cyclic pattern offset from GDB/pwndbg output.

        Looks for patterns like ``cyclic_find(0xXXX)`` in *cyclic_output*.
        If not found, attempts to parse the ``rip`` / ``rsp`` register value
        and return it as an integer for manual cyclic-offset lookup.

        Parameters
        ----------
        cyclic_output:
            String output from a GDB session that used pwndbg's ``cyclic``
            command or similar.

        Returns
        -------
        int | None
            The integer byte offset into the cyclic pattern, or ``None`` if
            it cannot be determined.
        """
        # Direct cyclic_find match
        m = _CYCLIC_FIND_RE.search(cyclic_output)
        if m:
            try:
                return int(m.group(1), 16)
            except ValueError:
                pass

        # pwndbg outputs lines like: cyclic offset 0x61616166 → 5
        offset_match = re.search(r"cyclic offset\s+\d+\s*(?:=|→|->)?\s*(\d+)", cyclic_output)
        if offset_match:
            try:
                return int(offset_match.group(1))
            except ValueError:
                pass

        # Fall back: return raw rip value so caller can use cyclic_find
        rip_m = _RIP_RE.search(cyclic_output)
        if rip_m:
            try:
                return int(rip_m.group(1), 16)
            except ValueError:
                pass

        return None

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def run_script(self, binary: str, **kwargs: Any) -> JobResult:
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
