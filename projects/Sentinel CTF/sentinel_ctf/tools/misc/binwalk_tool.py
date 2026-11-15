"""
sentinel_ctf.tools.misc.binwalk_tool
======================================
Binary analysis and embedded file extraction plugin wrapping ``binwalk``.

Scans binary files for magic byte signatures (firmware, filesystems,
compressed archives, encryption artefacts) and optionally extracts them.
"""
from __future__ import annotations

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)

# Match binwalk signature lines:
#   10           0xA          Zip archive data, at least v2.0 to extract
#   0            0x0          JPEG image data, JFIF standard 1.01
_BINWALK_SIG_RE = re.compile(
    r"^\s*(?P<decimal_offset>\d+)\s+"
    r"(?P<hex_offset>0x[0-9a-fA-F]+)\s+"
    r"(?P<description>.+)$"
)

# Filesystem type keywords
_FS_KEYWORDS = [
    "squashfs",
    "cramfs",
    "romfs",
    "jffs2",
    "yaffs",
    "ext2",
    "ext3",
    "ext4",
    "fat",
    "ntfs",
    "ubifs",
    "minix",
]

# Extracted file path pattern in binwalk -e output
_EXTRACTED_RE = re.compile(r"Extracting\s*:\s*(?P<path>\S+)", re.IGNORECASE)


class BinwalkTool(BaseTool):
    """
    Wraps ``binwalk`` for binary signature scanning and extraction.

    When *extract* is ``True``, binwalk will attempt to automatically extract
    recognised archives/filesystems.  The ``-M`` (matryoshka) flag recurses
    into extracted files.
    """

    name: str = "binwalk"
    description: str = "Binary analysis and embedded file extraction"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        extract: bool = False,
        recursive: bool = False,
        matryoshka: bool = False,
        extra_flags: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build the ``binwalk`` command.

        Parameters
        ----------
        filepath:
            Path to the binary file to analyse.
        extract:
            If ``True``, pass ``-e`` to extract recognised artefacts.
        recursive:
            If ``True`` (and *extract* is also ``True``), re-runs binwalk on
            each extracted file.  Enabled implicitly when *matryoshka* is set.
        matryoshka:
            If ``True``, pass ``-M`` for recursive matryoshka extraction.
            Implies *extract*.
        extra_flags:
            Additional raw flags appended verbatim.

        Returns
        -------
        str
            Shell command string.
        """
        parts = ["binwalk"]

        if extract or matryoshka:
            parts.append("-e")
        if matryoshka:
            parts.append("-M")
        if extra_flags:
            parts.append(extra_flags)

        parts.append(filepath)
        parts.append("2>/dev/null")

        return " ".join(parts)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse binwalk stdout into structured signature / extraction data.

        Returns
        -------
        dict with keys:

        * ``signatures`` – list of ``{offset, description, size}``
        * ``extracted_files`` – list of extracted file paths (if ``-e`` was used)
        * ``file_systems`` – list of detected filesystem type strings
        * ``flags_found`` – CTF flags found anywhere in the output
        """
        stdout = result.stdout or ""
        combined = stdout + "\n" + (result.stderr or "")

        signatures: list[dict[str, Any]] = []
        extracted_files: list[str] = []
        file_systems: list[str] = []
        flags_found: list[str] = []

        for line in combined.splitlines():
            # Signature lines
            m = _BINWALK_SIG_RE.match(line)
            if m:
                description = m.group("description").strip()
                signatures.append(
                    {
                        "offset": int(m.group("decimal_offset")),
                        "description": description,
                        # Size is not always available in standard binwalk output;
                        # we store None to maintain a consistent schema.
                        "size": None,
                    }
                )

                # Detect filesystem types
                desc_lower = description.lower()
                for fs_kw in _FS_KEYWORDS:
                    if fs_kw in desc_lower and fs_kw not in file_systems:
                        file_systems.append(fs_kw)

            # Extracted file paths
            em = _EXTRACTED_RE.search(line)
            if em:
                extracted_files.append(em.group("path"))

            # Flag check on every line
            for flag_m in _FLAG_RE.finditer(line):
                flag = flag_m.group(0)
                if flag not in flags_found:
                    flags_found.append(flag)

        return {
            "signatures": signatures,
            "extracted_files": extracted_files,
            "file_systems": file_systems,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def analyze(self, filepath: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        filepath:
            Path to the binary file to analyse.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(filepath=filepath, **kwargs)
