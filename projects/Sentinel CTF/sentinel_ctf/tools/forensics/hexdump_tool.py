"""
sentinel_ctf.tools.forensics.hexdump_tool
===========================================
Hex dump with magic byte identification and pattern analysis.
"""
from __future__ import annotations

import re
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

_MAGIC_BYTES: dict[str, str] = {
    "89504e47": "PNG image",
    "ffd8ffe0": "JPEG image (JFIF)",
    "ffd8ffe1": "JPEG image (EXIF)",
    "ffd8ffe2": "JPEG image (ICC)",
    "ffd8ffdb": "JPEG image (raw)",
    "47494638": "GIF image",
    "25504446": "PDF document",
    "504b0304": "ZIP archive / Office document",
    "504b0506": "ZIP archive (empty)",
    "52617221": "RAR archive",
    "377abcaf": "7-Zip archive",
    "7f454c46": "ELF binary",
    "4d5a":     "PE/DOS executable (MZ)",
    "424d":     "BMP image",
    "49492a00": "TIFF image (little-endian)",
    "4d4d002a": "TIFF image (big-endian)",
    "fffb":     "MP3 audio",
    "494433":   "MP3 audio (ID3)",
    "664c6143": "FLAC audio",
    "4f676753": "OGG container",
    "52494646": "WAV/AVI/RIFF",
    "1f8b08":   "GZIP archive",
    "425a68":   "BZIP2 archive",
    "fd377a58": "XZ archive",
    "cafebabe": "Java class / Mach-O fat binary",
    "feedface": "Mach-O 32-bit binary",
    "feedfacf": "Mach-O 64-bit binary",
    "d0cf11e0": "MS Office (DOC/XLS/PPT old format)",
    "526172211a07": "RAR5 archive",
    "53514c69":  "SQLite database",
    "1a45dfa3":  "Matroska/WebM video",
}


class HexdumpTool(BaseTool):
    name = "hexdump"
    description = "Hex dump with magic byte identification and pattern analysis"

    def build_command(self, filepath: str, length: int = 256, offset: int = 0, **kwargs) -> str:
        offset_arg = f"-s {offset}" if offset else ""
        return f"xxd -l {length} {offset_arg} {filepath} 2>/dev/null"

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        hex_lines = []
        raw_hex_parts = []

        for line in out.splitlines():
            # xxd format: 00000000: dead beef  ....
            m = re.match(r"([0-9a-f]+):\s+((?:[0-9a-f]{2}\s*)+)\s{2}(.+)", line, re.I)
            if m:
                offset_str = m.group(1)
                hex_part = m.group(2).strip()
                ascii_part = m.group(3)
                hex_lines.append({
                    "offset": int(offset_str, 16),
                    "hex": hex_part,
                    "ascii": ascii_part,
                })
                raw_hex_parts.append(hex_part.replace(" ", ""))

        raw_hex = "".join(raw_hex_parts)
        magic = raw_hex[:16].lower() if raw_hex else ""

        # Find printable strings (4+ consecutive printable bytes)
        try:
            raw_bytes = bytes.fromhex(raw_hex)
            strings = re.findall(rb"[ -~]{4,}", raw_bytes)
            printable = [s.decode("ascii", errors="replace") for s in strings]
        except Exception:
            printable = []

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)

        return {
            "hex_lines": hex_lines,
            "raw_hex": raw_hex,
            "magic_bytes": magic[:16],
            "file_type_guess": HexdumpTool.identify_magic(magic),
            "printable_strings": printable,
            "flags_found": flags_found,
        }

    @staticmethod
    def identify_magic(hex_start: str) -> str:
        """Match first bytes against known magic bytes. Returns file type or 'Unknown'."""
        h = hex_start.lower().replace(" ", "")
        for magic, label in _MAGIC_BYTES.items():
            if h.startswith(magic.lower()):
                return label
        return "Unknown"

    async def dump(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
