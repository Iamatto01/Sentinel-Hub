"""
sentinel_ctf.tools.forensics.image.pixel_analysis
===================================================
Pure-Python image forensics: LSB planes, colour histogram, alpha channel,
RGB channel splitting, pixel-level comparison, invisible ink detection.
Requires Pillow (pip install Pillow).
"""
from __future__ import annotations

import re
import struct
from pathlib import Path
from typing import Optional

from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class PixelAnalysisTool(BaseTool):
    name = "pixel_analysis"
    description = "Image pixel forensics: LSB planes, histogram, alpha channel, invisible ink"

    def build_command(self, filepath: str, mode: str = "all", channel: str = "R",
                      bit_plane: int = 0, **kwargs) -> str:
        """
        mode: 'all' | 'lsb' | 'histogram' | 'alpha' | 'planes' | 'compare'
        """
        script = (
            "import sys, json; "
            "from PIL import Image, ImageFilter; "
            f"img=Image.open('{filepath}'); "
        )
        if mode in ("all", "lsb", "planes"):
            script += (
                "rgb=img.convert('RGB'); px=list(rgb.getdata()); "
                "bits={'R':[],'G':[],'B':[]}; "
                "[bits['R'].append((p[0]>>0)&1) or bits['G'].append((p[1]>>0)&1) or bits['B'].append((p[2]>>0)&1) for p in px]; "
                "[print(f'LSB_{c}:' + ''.join(map(str,bits[c][:200]))) for c in 'RGB']; "
            )
        if mode in ("all", "alpha"):
            script += (
                "rgba=img.convert('RGBA'); "
                "alphas=[p[3] for p in rgba.getdata()]; "
                "non255=[a for a in alphas if a!=255]; "
                "print(f'ALPHA_NON255:{len(non255)}'); "
                "print(f'ALPHA_SAMPLE:{alphas[:20]}'); "
            )
        if mode in ("all", "histogram"):
            script += (
                "rgb=img.convert('RGB'); hist=rgb.histogram(); "
                "r=hist[:256]; g=hist[256:512]; b=hist[512:]; "
                "print(f'SIZE:{rgb.size}'); "
                "print(f'MODE:{img.mode}'); "
                "r_max=max(enumerate(r),key=lambda x:x[1]); "
                "g_max=max(enumerate(g),key=lambda x:x[1]); "
                "b_max=max(enumerate(b),key=lambda x:x[1]); "
                "print(f'DOMINANT_R:{r_max[0]}({r_max[1]}px)'); "
                "print(f'DOMINANT_G:{g_max[0]}({g_max[1]}px)'); "
                "print(f'DOMINANT_B:{b_max[0]}({b_max[1]}px)'); "
            )
        script += "print('DONE')"
        return f"python3 -c \"{script}\" 2>/dev/null"

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        findings: dict = {}

        # Parse LSB streams
        lsb_data: dict[str, str] = {}
        for ch in ("R", "G", "B"):
            m = re.search(rf"LSB_{ch}:([01]+)", out)
            if m:
                bits = m.group(1)
                # Convert bits to text
                chars = []
                for i in range(0, len(bits) - 7, 8):
                    byte = int(bits[i:i+8], 2)
                    if 32 <= byte <= 126:
                        chars.append(chr(byte))
                lsb_data[ch] = "".join(chars)
        findings["lsb_text"] = lsb_data

        # Alpha channel
        m_alpha = re.search(r"ALPHA_NON255:(\d+)", out)
        if m_alpha:
            findings["alpha_non_255_count"] = int(m_alpha.group(1))
            findings["alpha_suspicious"] = int(m_alpha.group(1)) > 0

        # Image info
        m_size = re.search(r"SIZE:\((\d+), (\d+)\)", out)
        if m_size:
            findings["width"] = int(m_size.group(1))
            findings["height"] = int(m_size.group(2))

        m_mode = re.search(r"MODE:(\S+)", out)
        if m_mode:
            findings["mode"] = m_mode.group(1)

        # Dominant colours
        for ch in ("R", "G", "B"):
            m = re.search(rf"DOMINANT_{ch}:(\d+)\((\d+)px\)", out)
            if m:
                findings[f"dominant_{ch.lower()}"] = {"value": int(m.group(1)), "count": int(m.group(2))}

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)
        # Also check LSB text for flags
        for ch, text in lsb_data.items():
            flags_found += re.findall(r"flag\{[^}]+\}", text, re.I)

        findings["flags_found"] = list(set(flags_found))
        return findings

    @staticmethod
    def extract_bit_plane(filepath: str, channel: str = "R", bit: int = 0) -> bytes:
        """
        Extract a single bit-plane as raw bytes (1 bit per pixel, packed).
        channel: 'R', 'G', 'B', 'A'
        bit: 0 (LSB) to 7 (MSB)
        Returns packed bytes or empty on failure.
        """
        try:
            from PIL import Image
            ch_map = {"R": 0, "G": 1, "B": 2, "A": 3}
            ch_idx = ch_map.get(channel.upper(), 0)
            img = Image.open(filepath).convert("RGBA" if channel == "A" else "RGB")
            pixels = list(img.getdata())
            bits = [(p[ch_idx] >> bit) & 1 for p in pixels]
            # Pack bits into bytes
            result = bytearray()
            for i in range(0, len(bits) - 7, 8):
                byte = sum(bits[i + b] << b for b in range(8))
                result.append(byte)
            return bytes(result)
        except Exception:
            return b""

    @staticmethod
    def all_lsb_planes(filepath: str) -> dict[str, bytes]:
        """Extract all 8 bit-planes for R, G, B channels. Returns dict of 'R0'..'B7'."""
        result = {}
        for ch in ("R", "G", "B"):
            for bit in range(8):
                key = f"{ch}{bit}"
                result[key] = PixelAnalysisTool.extract_bit_plane(filepath, ch, bit)
        return result

    @staticmethod
    def detect_invisible_ink(filepath: str) -> dict:
        """
        Detect invisible ink / near-white pixels on white background.
        Returns pixels that differ by < threshold from white (255,255,255).
        """
        try:
            from PIL import Image
            img = Image.open(filepath).convert("RGB")
            pixels = list(img.getdata())
            w, h = img.size
            invisible = []
            for idx, (r, g, b) in enumerate(pixels):
                # Near-white but not perfectly white
                if (r > 240 or g > 240 or b > 240) and (r != 255 or g != 255 or b != 255):
                    x, y = idx % w, idx // w
                    invisible.append({"x": x, "y": y, "rgb": (r, g, b)})
            return {"invisible_pixels": len(invisible), "samples": invisible[:20]}
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def split_channels(filepath: str, output_dir: str = "/tmp") -> list[str]:
        """
        Save R, G, B, Alpha channels as separate grayscale PNG files.
        Returns list of created file paths.
        """
        try:
            from PIL import Image
            img = Image.open(filepath)
            base = Path(filepath).stem
            paths = []
            rgba = img.convert("RGBA")
            for i, ch in enumerate(("R", "G", "B", "A")):
                channel_img = rgba.split()[i]
                out_path = f"{output_dir}/{base}_channel_{ch}.png"
                channel_img.save(out_path)
                paths.append(out_path)
            return paths
        except Exception:
            return []

    @staticmethod
    def compare_images(filepath1: str, filepath2: str) -> dict:
        """
        Pixel-level comparison between two images.
        Returns difference stats and highlights changed regions.
        """
        try:
            from PIL import Image, ImageChops
            img1 = Image.open(filepath1).convert("RGB")
            img2 = Image.open(filepath2).convert("RGB")
            if img1.size != img2.size:
                return {"error": f"Size mismatch: {img1.size} vs {img2.size}"}
            diff = ImageChops.difference(img1, img2)
            pixels = list(diff.getdata())
            changed = [p for p in pixels if any(c > 0 for c in p)]
            nonzero = [p for p in pixels if any(c > 5 for c in p)]
            return {
                "total_pixels": len(pixels),
                "changed_pixels": len(changed),
                "significant_changes": len(nonzero),
                "change_percent": round(len(changed) / len(pixels) * 100, 2),
                "max_diff": max(max(p) for p in pixels) if pixels else 0,
            }
        except Exception as e:
            return {"error": str(e)}

    async def analyze(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
