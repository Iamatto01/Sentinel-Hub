"""
sentinel_ctf.tools.forensics.image.png_tool
=============================================
Deep PNG forensics: chunk inspector, IHDR parser, tEXt/zTXt hidden data,
IDAT raw stream extraction, corrupt PNG repair hints.
"""
from __future__ import annotations

import re
import struct
import zlib
from pathlib import Path

from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

_CHUNK_TYPES = {
    b"IHDR": "Image header (width, height, bit depth, colour type)",
    b"IDAT": "Image data (compressed)",
    b"IEND": "Image trailer",
    b"tEXt": "Textual data (keyword + text, Latin-1)",
    b"zTXt": "Compressed textual data",
    b"iTXt": "International textual data (UTF-8)",
    b"cHRM": "Primary chromaticities",
    b"gAMA": "Image gamma",
    b"iCCP": "Embedded ICC colour profile",
    b"sBIT": "Significant bits",
    b"sRGB": "Standard RGB colour space",
    b"bKGD": "Background colour",
    b"hIST": "Image histogram",
    b"tRNS": "Transparency",
    b"pHYs": "Physical pixel dimensions",
    b"sPLT": "Suggested palette",
    b"tIME": "Image last-modification time",
    b"eXIf": "Embedded EXIF metadata",
    b"acTL": "Animation control (APNG)",
    b"fcTL": "Frame control (APNG)",
    b"fdAT": "Frame data (APNG)",
    b"fUId": "Custom/unknown chunk",
}


def _read_chunks(data: bytes) -> list[dict]:
    """Parse PNG chunks from raw bytes."""
    if not data.startswith(_PNG_MAGIC):
        return []
    pos = 8  # skip magic
    chunks = []
    while pos + 12 <= len(data):
        length = struct.unpack(">I", data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8]
        chunk_data = data[pos+8:pos+8+length]
        crc = data[pos+8+length:pos+12+length]
        expected_crc = struct.pack(">I", zlib.crc32(chunk_type + chunk_data) & 0xFFFFFFFF)
        chunks.append({
            "type": chunk_type.decode("latin-1", errors="replace"),
            "length": length,
            "data": chunk_data,
            "crc_valid": crc == expected_crc,
            "offset": pos,
        })
        pos += 12 + length
    return chunks


class PngTool(BaseTool):
    name = "png_tool"
    description = "Deep PNG forensics: chunk inspector, hidden tEXt/zTXt data, IHDR analysis"

    def build_command(self, filepath: str, **kwargs) -> str:
        return (
            f"python3 -c \""
            f"import struct,zlib; "
            f"d=open('{filepath}','rb').read(); "
            f"pos=8; "
            f"while pos+12<=len(d): "
            f"  l=struct.unpack('>I',d[pos:pos+4])[0]; "
            f"  t=d[pos+4:pos+8]; "
            f"  chunk=d[pos+8:pos+8+l]; "
            f"  print(f'CHUNK:{{t.decode(chr(39)latin-1{chr(39)})}}/{{l}}/{{chunk[:80]}}'); "
            f"  pos+=12+l"
            f"\" 2>/dev/null"
        )

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        chunks_summary = []
        hidden_text = []
        flags_found = []

        for line in out.splitlines():
            if line.startswith("CHUNK:"):
                parts = line[6:].split("/", 2)
                if len(parts) >= 2:
                    ctype = parts[0]
                    length = parts[1]
                    data_preview = parts[2] if len(parts) > 2 else ""
                    chunks_summary.append({"type": ctype, "length": length})
                    if ctype in ("tEXt", "zTXt", "iTXt", "eXIf"):
                        hidden_text.append({"type": ctype, "preview": data_preview[:200]})

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)
        return {
            "chunks": chunks_summary,
            "total_chunks": len(chunks_summary),
            "hidden_text": hidden_text,
            "flags_found": flags_found,
        }

    @staticmethod
    def inspect(filepath: str) -> dict:
        """Full pure-Python chunk inspection."""
        try:
            data = Path(filepath).read_bytes()
        except Exception as e:
            return {"error": str(e)}

        if not data.startswith(_PNG_MAGIC):
            return {"error": "Not a valid PNG file"}

        chunks = _read_chunks(data)
        result: dict = {
            "chunk_count": len(chunks),
            "chunks": [],
            "hidden_data": [],
            "ihdr": {},
            "flags_found": [],
            "crc_errors": [],
        }

        idat_parts = []
        for ch in chunks:
            t = ch["type"]
            entry = {
                "type": t,
                "offset": ch["offset"],
                "length": ch["length"],
                "crc_valid": ch["crc_valid"],
                "description": _CHUNK_TYPES.get(t.encode("latin-1", errors="replace"), "Unknown"),
            }
            result["chunks"].append(entry)

            if not ch["crc_valid"]:
                result["crc_errors"].append(t)

            # Parse IHDR
            if t == "IHDR" and len(ch["data"]) >= 13:
                w, h = struct.unpack(">II", ch["data"][:8])
                bd, ct = ch["data"][8], ch["data"][9]
                ct_names = {0: "Greyscale", 2: "Truecolour", 3: "Indexed", 4: "Greyscale+Alpha", 6: "Truecolour+Alpha"}
                result["ihdr"] = {
                    "width": w, "height": h,
                    "bit_depth": bd,
                    "colour_type": ct_names.get(ct, str(ct)),
                }

            # tEXt / zTXt / iTXt hidden content
            if t == "tEXt":
                text = ch["data"].decode("latin-1", errors="replace")
                result["hidden_data"].append({"type": "tEXt", "content": text})
                result["flags_found"] += re.findall(r"flag\{[^}]+\}", text, re.I)

            if t == "zTXt":
                try:
                    null_pos = ch["data"].index(b"\x00")
                    keyword = ch["data"][:null_pos].decode("latin-1")
                    compressed = ch["data"][null_pos+2:]
                    text = zlib.decompress(compressed).decode("utf-8", errors="replace")
                    result["hidden_data"].append({"type": "zTXt", "keyword": keyword, "content": text})
                    result["flags_found"] += re.findall(r"flag\{[^}]+\}", text, re.I)
                except Exception:
                    pass

            if t == "iTXt":
                try:
                    text = ch["data"].decode("utf-8", errors="replace")
                    result["hidden_data"].append({"type": "iTXt", "content": text})
                    result["flags_found"] += re.findall(r"flag\{[^}]+\}", text, re.I)
                except Exception:
                    pass

            if t == "IDAT":
                idat_parts.append(ch["data"])

        # Try to find appended data after IEND
        iend_chunks = [c for c in chunks if c["type"] == "IEND"]
        if iend_chunks:
            last_iend = iend_chunks[-1]
            trail_start = last_iend["offset"] + 12
            if trail_start < len(data):
                appended = data[trail_start:]
                result["appended_data"] = {
                    "size": len(appended),
                    "hex_preview": appended[:64].hex(),
                    "text_preview": appended[:64].decode("utf-8", errors="replace"),
                }
                result["flags_found"] += re.findall(r"flag\{[^}]+\}", appended.decode("utf-8", errors="replace"), re.I)

        result["flags_found"] = list(set(result["flags_found"]))
        return result

    @staticmethod
    def fix_header(filepath: str) -> bytes:
        """Return data with corrected PNG magic bytes if header is corrupted."""
        data = Path(filepath).read_bytes()
        if data.startswith(_PNG_MAGIC):
            return data
        return _PNG_MAGIC + data[8:]

    @staticmethod
    def extract_idat(filepath: str) -> bytes:
        """Extract and decompress raw IDAT pixel data."""
        data = Path(filepath).read_bytes()
        chunks = _read_chunks(data)
        idat_parts = [c["data"] for c in chunks if c["type"] == "IDAT"]
        if not idat_parts:
            return b""
        try:
            return zlib.decompress(b"".join(idat_parts))
        except Exception:
            return b""

    async def analyze(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
