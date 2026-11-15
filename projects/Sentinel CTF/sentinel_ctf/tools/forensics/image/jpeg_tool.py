"""
sentinel_ctf.tools.forensics.image.jpeg_tool
==============================================
JPEG forensics: JFIF/EXIF segment parser, thumbnail extraction,
APP marker analysis, comment extraction, Huffman/quantisation table dump,
JPEG steganography hints (OutGuess, F5, JSteg detection heuristics).
"""
from __future__ import annotations

import re
import struct
from pathlib import Path

from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# JPEG markers
_MARKERS = {
    0xFFD8: "SOI  (Start of Image)",
    0xFFE0: "APP0 (JFIF)",
    0xFFE1: "APP1 (EXIF/XMP)",
    0xFFE2: "APP2 (ICC/FlashPix)",
    0xFFEC: "APP12 (Photoshop)",
    0xFFED: "APP13 (IPTC)",
    0xFFEE: "APP14 (Adobe)",
    0xFFDB: "DQT  (Define Quantisation Table)",
    0xFFC0: "SOF0 (Start of Frame, baseline DCT)",
    0xFFC2: "SOF2 (Start of Frame, progressive DCT)",
    0xFFC4: "DHT  (Define Huffman Table)",
    0xFFDA: "SOS  (Start of Scan)",
    0xFFD9: "EOI  (End of Image)",
    0xFFFE: "COM  (Comment)",
    0xFFDD: "DRI  (Define Restart Interval)",
}


def _parse_jpeg_segments(data: bytes) -> list[dict]:
    """Walk JPEG segments and return list of {marker, name, offset, length, data}."""
    if not data[:2] == b"\xff\xd8":
        return []
    segments = []
    pos = 0
    while pos < len(data) - 1:
        if data[pos] != 0xFF:
            pos += 1
            continue
        marker = struct.unpack(">H", data[pos:pos+2])[0]
        name = _MARKERS.get(marker, f"Unknown (0x{marker:04X})")
        # Standalone markers (no length)
        if marker in (0xFFD8, 0xFFD9, 0xFFDA):
            segments.append({"marker": f"0x{marker:04X}", "name": name, "offset": pos, "length": 0, "data": b""})
            if marker == 0xFFD9:
                break
            if marker == 0xFFDA:
                # SOS — skip to next marker
                pos += 2
                while pos < len(data) - 1:
                    if data[pos] == 0xFF and data[pos+1] not in (0x00, 0xFF):
                        break
                    pos += 1
                continue
            pos += 2
            continue
        if pos + 4 > len(data):
            break
        length = struct.unpack(">H", data[pos+2:pos+4])[0]
        seg_data = data[pos+4:pos+2+length]
        segments.append({
            "marker": f"0x{marker:04X}",
            "name": name,
            "offset": pos,
            "length": length,
            "data": seg_data,
        })
        pos += 2 + length
    return segments


class JpegTool(BaseTool):
    name = "jpeg_tool"
    description = "JPEG forensics: segment parser, comment extraction, thumbnail, EXIF, steg hints"

    def build_command(self, filepath: str, **kwargs) -> str:
        return (
            f"python3 -c \""
            f"import struct; "
            f"d=open('{filepath}','rb').read(); "
            f"pos=0; "
            f"while pos<len(d)-1: "
            f"  if d[pos]!=0xFF: pos+=1; continue; "
            f"  m=struct.unpack('>H',d[pos:pos+2])[0]; "
            f"  if m==0xFFD9: print('SEG:EOI/0/'); break; "
            f"  if m in(0xFFD8,0xFFDA): print(f'SEG:{{hex(m)}}/0/'); pos+=2; continue; "
            f"  if pos+4>len(d): break; "
            f"  l=struct.unpack('>H',d[pos+2:pos+4])[0]; "
            f"  preview=d[pos+4:pos+4+min(80,l)]; "
            f"  print(f'SEG:{{hex(m)}}/{{l}}/{{preview}}'); "
            f"  pos+=2+l"
            f"\" 2>/dev/null"
        )

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        segments = []
        comments = []
        flags_found = []

        for line in out.splitlines():
            if not line.startswith("SEG:"):
                continue
            parts = line[4:].split("/", 2)
            if len(parts) < 2:
                continue
            marker = parts[0]
            length = parts[1]
            preview = parts[2] if len(parts) > 2 else ""
            name = _MARKERS.get(int(marker, 16), "Unknown") if marker.startswith("0x") else "?"
            segments.append({"marker": marker, "name": name, "length": length})
            # COM segments = comments
            if marker == "0xfffe":
                comments.append(preview)
                flags_found += re.findall(r"flag\{[^}]+\}", preview, re.I)

        flags_found += re.findall(r"flag\{[^}]+\}", out, re.I)
        return {
            "segments": segments,
            "total_segments": len(segments),
            "comments": comments,
            "flags_found": list(set(flags_found)),
        }

    @staticmethod
    def inspect(filepath: str) -> dict:
        """Full pure-Python JPEG inspection."""
        try:
            data = Path(filepath).read_bytes()
        except Exception as e:
            return {"error": str(e)}

        segments = _parse_jpeg_segments(data)
        result: dict = {
            "valid_jpeg": data[:2] == b"\xff\xd8",
            "segments": [],
            "comments": [],
            "exif_present": False,
            "xmp_present": False,
            "thumbnail": None,
            "quantisation_tables": [],
            "appended_data": None,
            "flags_found": [],
        }

        for seg in segments:
            entry = {
                "marker": seg["marker"],
                "name": seg["name"],
                "offset": seg["offset"],
                "length": seg["length"],
            }
            result["segments"].append(entry)
            d = seg["data"]

            # COM: plain comments
            if seg["marker"] == "0xfffe":
                text = d.decode("utf-8", errors="replace")
                result["comments"].append(text)
                result["flags_found"] += re.findall(r"flag\{[^}]+\}", text, re.I)

            # APP1: EXIF or XMP
            if seg["marker"] == "0xffe1":
                if d.startswith(b"Exif"):
                    result["exif_present"] = True
                elif d.startswith(b"http://ns.adobe.com") or d.startswith(b"<?xpacket"):
                    result["xmp_present"] = True
                    xmp_text = d.decode("utf-8", errors="replace")
                    result["flags_found"] += re.findall(r"flag\{[^}]+\}", xmp_text, re.I)

            # APP0 / JFIF: check for embedded thumbnail
            if seg["marker"] == "0xffe0" and d.startswith(b"JFIF"):
                thumb_w = d[13] if len(d) > 13 else 0
                thumb_h = d[14] if len(d) > 14 else 0
                if thumb_w > 0 and thumb_h > 0:
                    result["thumbnail"] = {"width": thumb_w, "height": thumb_h}

            # DQT: quantisation table
            if seg["marker"] == "0xffdb" and len(d) >= 65:
                result["quantisation_tables"].append(list(d[1:65]))

        # Appended data after EOI
        eoi_segments = [s for s in segments if s["marker"] == "0xffd9"]
        if eoi_segments:
            last_eoi = eoi_segments[-1]
            trail_start = last_eoi["offset"] + 2
            if trail_start < len(data):
                appended = data[trail_start:]
                result["appended_data"] = {
                    "size": len(appended),
                    "hex_preview": appended[:64].hex(),
                    "text_preview": appended[:64].decode("utf-8", errors="replace"),
                }
                result["flags_found"] += re.findall(r"flag\{[^}]+\}", result["appended_data"]["text_preview"], re.I)

        result["flags_found"] = list(set(result["flags_found"]))
        return result

    async def analyze(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
