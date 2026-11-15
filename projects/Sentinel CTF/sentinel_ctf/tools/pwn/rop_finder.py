"""
sentinel_ctf.tools.pwn.rop_finder
===================================
ROP gadget discovery plugin.

Wraps ``ROPgadget`` and ``ropper`` to locate useful gadgets (e.g.
``pop rdi ; ret``) in a target ELF binary.
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

# ROPgadget / ropper gadget line format:
#   0x00401234 : pop rdi ; ret
#   0x0040abcd : pop rdi; ret
_GADGET_LINE_RE = re.compile(
    r"^(0x[0-9a-fA-F]+)\s*:\s*(.+)$",
    re.MULTILINE,
)


class RopFinderTool(BaseTool):
    """
    Finds ROP gadgets inside a binary using ROPgadget or ropper.

    Both tools produce similar line-based output that is parsed into a
    unified list of ``{address, instruction_sequence}`` dicts.
    """

    name: str = "ropgadget"
    description: str = "ROP gadget finder using ROPgadget and ropper"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        binary: str,
        search: str = "pop rdi",
        tool: str = "ropgadget",
        extra_flags: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build the ROP gadget search command.

        Parameters
        ----------
        binary:
            Path to the ELF binary to search.
        search:
            Gadget substring to filter for (e.g. ``'pop rdi'``).
        tool:
            Which backend to use: ``'ropgadget'`` or ``'ropper'``.
        extra_flags:
            Additional raw flags appended to the command.

        Returns
        -------
        str
            Shell command string.
        """
        binary_q = shlex.quote(binary)
        search_q = shlex.quote(search)

        if tool == "ropper":
            cmd = (
                f"ropper -f {binary_q} --search {search_q}"
                f"{' ' + extra_flags if extra_flags else ''} 2>/dev/null"
            )
        else:
            # Default: ROPgadget
            cmd = (
                f"ROPgadget --binary {binary_q} --rop --nojop"
                f"{' ' + extra_flags if extra_flags else ''}"
                f" | grep {search_q} 2>/dev/null"
            )

        return cmd

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse ROPgadget / ropper output into structured gadget data.

        Returns
        -------
        dict with keys:

        * ``gadgets`` – list of ``{address, instruction_sequence}``
        * ``best_match`` – first gadget dict, or ``None``
        * ``flags_found`` – CTF flags seen in output
        """
        stdout = result.stdout or ""
        flags_found: list[str] = []
        gadgets: list[dict[str, str]] = []

        for m in _GADGET_LINE_RE.finditer(stdout):
            address = m.group(1).strip()
            instructions = m.group(2).strip()
            # Skip tool header lines like "Gadgets information"
            if instructions.startswith("=") or not address.startswith("0x"):
                continue
            gadgets.append({"address": address, "instruction_sequence": instructions})

        # Flags
        for flag_m in _FLAG_RE.finditer(stdout):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        best_match = gadgets[0] if gadgets else None

        return {
            "gadgets": gadgets,
            "best_match": best_match,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def find(self, binary: str, search: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        binary:
            Path to the target ELF binary.
        search:
            Gadget instruction substring to search for.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(binary=binary, search=search, **kwargs)
