"""
sentinel_ctf.payloads.forensics.payloads
==========================================
Forensics payload helpers: magic bytes, steganography passphrases,
Volatility plugins, and file analysis utilities.
"""
from __future__ import annotations

import re
import struct
from pathlib import Path

# ---------------------------------------------------------------------------
# Magic bytes — file_type → hex_signature (first bytes, lowercase no spaces)
# ---------------------------------------------------------------------------
MAGIC_BYTES: dict[str, str] = {
    "PNG":        "89504e47",
    "JPEG":       "ffd8ffe0",
    "JPEG_EXIF":  "ffd8ffe1",
    "GIF87a":     "47494638 37",
    "GIF89a":     "47494638 39",
    "BMP":        "424d",
    "TIFF_LE":    "49492a00",
    "TIFF_BE":    "4d4d002a",
    "PDF":        "25504446",
    "ZIP":        "504b0304",
    "RAR4":       "52617221 1a0700",
    "RAR5":       "52617221 1a070100",
    "7ZIP":       "377abcaf 271c",
    "GZIP":       "1f8b",
    "BZIP2":      "425a68",
    "XZ":         "fd377a58 5a00",
    "ELF":        "7f454c46",
    "PE_MZ":      "4d5a",
    "MACH_O_32":  "feedface",
    "MACH_O_64":  "feedfacf",
    "SQLite":     "53514c69 7465",
    "MP3_ID3":    "494433",
    "MP3_SYNC":   "fffb",
    "FLAC":       "664c6143",
    "OGG":        "4f676753",
    "WAV":        "52494646",
    "MP4":        "00000020 6674797",
    "WEBP":       "52494646 ???????? 57454250",
    "Matroska":   "1a45dfa3",
    "Java_class": "cafebabe",
    "DOC_old":    "d0cf11e0",
    "PSD":        "38425053",
    "ICO":        "00000100",
    "PCAP":       "d4c3b2a1",
    "PCAPNG":     "0a0d0d0a",
    "pyc38":      "550d0d0a",
}

# ---------------------------------------------------------------------------
# Steganography common passphrases to try
# ---------------------------------------------------------------------------
STEG_PASSPHRASES: list[str] = [
    "",                     # empty (most common in CTF)
    "password",
    "secret",
    "hidden",
    "steghide",
    "steg",
    "flag",
    "ctf",
    "admin",
    "1234",
    "12345",
    "123456",
    "abc123",
    "qwerty",
    "letmein",
    "monkey",
    "shadow",
    "master",
    "passphrase",
    "securepassword",
    "steganography",
    "invisible",
    "embedded",
    "encode",
    "decode",
    "picoctf",
    "hackthebox",
    "tryhackme",
    "cyber",
    "hacker",
]

# ---------------------------------------------------------------------------
# Most useful Volatility 3 plugins
# ---------------------------------------------------------------------------
VOLATILITY_PLUGINS_WINDOWS: list[str] = [
    "windows.pslist.PsList",
    "windows.pstree.PsTree",
    "windows.cmdline.CmdLine",
    "windows.dlllist.DllList",
    "windows.filescan.FileScan",
    "windows.dumpfiles.DumpFiles",
    "windows.netscan.NetScan",
    "windows.netstat.NetStat",
    "windows.malfind.Malfind",
    "windows.hashdump.Hashdump",
    "windows.registry.hivelist.HiveList",
    "windows.registry.printkey.PrintKey",
    "windows.handles.Handles",
    "windows.memmap.Memmap",
    "windows.info.Info",
]

VOLATILITY_PLUGINS_LINUX: list[str] = [
    "linux.pslist.PsList",
    "linux.pstree.PsTree",
    "linux.bash.Bash",
    "linux.netstat.Netstat",
    "linux.lsof.Lsof",
    "linux.proc.Maps",
    "linux.check_syscall.Check_syscall",
    "linux.keyboard_notifiers.Keyboard_notifiers",
    "linux.hidden_modules.Hidden_modules",
    "linux.malfind.Malfind",
]

# ---------------------------------------------------------------------------
# Files commonly hidden in forensics CTF challenges
# ---------------------------------------------------------------------------
COMMON_HIDDEN_FILES: list[str] = [
    "flag.txt", "flag", "secret.txt", ".flag", ".secret",
    "hidden.txt", "password.txt", "key.txt", "note.txt",
    "README.txt", "readme.md", "hint.txt",
    ".bash_history", ".ssh/id_rsa", ".ssh/authorized_keys",
    "/etc/passwd", "/etc/shadow", "/etc/crontab",
    "config.php", "config.py", "settings.py", ".env",
    "backup.zip", "database.db", "dump.sql",
    "authorized_keys", "private.key",
]


# ---------------------------------------------------------------------------
# ForensicsPayloads class
# ---------------------------------------------------------------------------
class ForensicsPayloads:

    @staticmethod
    def fix_magic_bytes(data: bytes, file_type: str) -> bytes:
        """Replace first bytes with correct magic for file_type."""
        magic_hex = MAGIC_BYTES.get(file_type.upper(), "").replace(" ", "")
        if not magic_hex or "?" in magic_hex:
            raise ValueError(f"Unknown or ambiguous file type: {file_type}")
        magic = bytes.fromhex(magic_hex)
        return magic + data[len(magic):]

    @staticmethod
    def find_appended_data(filepath: str) -> bytes | None:
        """
        Read file and find data appended after the EOF marker.
        Supports PNG (IEND), JPEG (FFD9), PDF (%%EOF), ZIP (EOCD).
        Returns appended bytes or None if nothing found.
        """
        data = Path(filepath).read_bytes()

        # PNG: after IEND chunk (8 bytes after 'IEND')
        iend_idx = data.find(b"\x49\x45\x4e\x44")  # "IEND"
        if iend_idx != -1:
            after = data[iend_idx + 8:]  # IEND + CRC (4 bytes)
            if after:
                return after

        # JPEG: after FFD9
        ffd9_idx = data.rfind(b"\xff\xd9")
        if ffd9_idx != -1:
            after = data[ffd9_idx + 2:]
            if after:
                return after

        # PDF: after %%EOF
        eof_idx = data.rfind(b"%%EOF")
        if eof_idx != -1:
            after = data[eof_idx + 5:].lstrip(b"\r\n")
            if after:
                return after

        return None

    @staticmethod
    def extract_lsb_image(filepath: str, channels: str = "RGB", bits: int = 1) -> bytes:
        """
        Pure-Python LSB extraction from image using PIL.
        Returns extracted bytes or empty bytes if PIL not available.
        """
        try:
            from PIL import Image
            img = Image.open(filepath).convert("RGB")
            pixels = list(img.getdata())
            channel_map = {"R": 0, "G": 1, "B": 2, "A": 3}
            selected = [channel_map[c] for c in channels.upper() if c in channel_map]

            bit_stream = []
            for pixel in pixels:
                for ch in selected:
                    if ch < len(pixel):
                        for b in range(bits):
                            bit_stream.append((pixel[ch] >> b) & 1)

            # Pack bits into bytes
            result = bytearray()
            for i in range(0, len(bit_stream) - 7, 8):
                byte = 0
                for b in range(8):
                    byte |= bit_stream[i + b] << b
                result.append(byte)
            return bytes(result)
        except ImportError:
            return b""

    @staticmethod
    def detect_encoding_in_strings(strings_output: str) -> list[dict]:
        """
        Scan strings output for lines that look like encoded data.
        Returns list of {encoding, value, line}.
        """
        results = []
        for line in strings_output.splitlines():
            line = line.strip()
            if not line or len(line) < 8:
                continue

            # Base64 (long alphanum with optional +=/)
            if re.match(r"^[A-Za-z0-9+/]{16,}={0,2}$", line):
                results.append({"encoding": "base64", "value": line, "line": line})
            # Hex string (even length, hex chars)
            elif re.match(r"^[0-9a-fA-F]{16,}$", line) and len(line) % 2 == 0:
                results.append({"encoding": "hex", "value": line, "line": line})
            # Binary (space-separated 8-bit)
            elif re.match(r"^[01]{8}(\s[01]{8}){3,}$", line):
                results.append({"encoding": "binary", "value": line, "line": line})
            # Morse code
            elif re.match(r"^[.\-/ ]{10,}$", line) and (".-" in line or "-." in line):
                results.append({"encoding": "morse", "value": line, "line": line})
            # URL encoded
            elif "%" in line and re.search(r"%[0-9a-fA-F]{2}", line):
                results.append({"encoding": "url", "value": line, "line": line})
            # Decimal ASCII (space-separated numbers in printable range)
            elif re.match(r"^(\d{2,3}\s){4,}\d{2,3}$", line):
                nums = [int(n) for n in line.split() if n.isdigit()]
                if all(32 <= n <= 126 for n in nums):
                    results.append({"encoding": "decimal_ascii", "value": line, "line": line})

        return results
