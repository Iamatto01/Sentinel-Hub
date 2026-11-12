"""
sentinel_ctf.tools.crypto.xor_tool
=====================================
XOR cipher analysis — brute force, key-length detection, frequency analysis.
Runs locally (pure Python) — no Kali executor needed.
"""
from __future__ import annotations

import math
import re
import string
from collections import Counter
from itertools import cycle

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class XorTool(BaseTool):
    name = "xor"
    description = "XOR cipher analysis and brute force (pure Python, local)"

    def build_command(
        self,
        hex_data: str,
        key_length: int = 1,
        min_key_len: int = 1,
        max_key_len: int = 16,
        **kwargs,
    ) -> str:
        clean = hex_data.replace(" ", "").replace("\n", "")
        return (
            f'python3 -c "'
            f'import sys; data=bytes.fromhex(\'{clean}\'); '
            f'[print(f\'KEY={{k:02x}}: {{bytes(b^k for b in data).decode(chr(39)utf-8{chr(39)},errors={chr(39)}replace{chr(39)})}}\') '
            f'for k in range(256) '
            f'if sum(1 for b in bytes(x^k for x in data) if 32<=b<127)/len(data)>0.7]"'
        )

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        results = []
        for line in out.splitlines():
            m = re.match(r"KEY=([0-9a-f]{2}): (.+)", line)
            if m:
                results.append({
                    "key_hex": m.group(1),
                    "key": int(m.group(1), 16),
                    "decrypted": m.group(2),
                })
        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)
        return {"results": results, "total": len(results), "flags_found": flags_found}

    # ------------------------------------------------------------------
    # Pure-Python static methods (no subprocess needed)
    # ------------------------------------------------------------------

    @staticmethod
    def xor_decrypt(data: bytes, key: bytes) -> bytes:
        """XOR data with repeating key."""
        return bytes(a ^ b for a, b in zip(data, cycle(key)))

    @staticmethod
    def _printability_score(data: bytes) -> float:
        """Score 0-1: fraction of printable ASCII characters."""
        if not data:
            return 0.0
        return sum(1 for b in data if 32 <= b < 127) / len(data)

    @staticmethod
    def _english_score(data: bytes) -> float:
        """Score text by English letter frequency."""
        freq = {
            b"e"[0]: 12.7, b"t"[0]: 9.1, b"a"[0]: 8.2, b"o"[0]: 7.5,
            b"i"[0]: 7.0, b"n"[0]: 6.7, b"s"[0]: 6.3, b"h"[0]: 6.1,
            b"r"[0]: 6.0, b" "[0]: 13.0,
        }
        score = sum(freq.get(b | 0x20, 0) for b in data)
        return score / max(len(data), 1)

    @staticmethod
    def single_byte_brute(data: bytes) -> list[dict]:
        """
        Try all 256 single-byte XOR keys.
        Returns sorted list of {key, key_hex, decrypted, score}.
        """
        results = []
        for k in range(256):
            decrypted = bytes(b ^ k for b in data)
            score = XorTool._english_score(decrypted)
            printable = XorTool._printability_score(decrypted)
            if printable > 0.6:
                results.append({
                    "key": k,
                    "key_hex": f"{k:02x}",
                    "decrypted": decrypted.decode("utf-8", errors="replace"),
                    "score": score,
                    "printable_ratio": printable,
                })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    @staticmethod
    def _hamming_distance(a: bytes, b: bytes) -> int:
        return sum(bin(x ^ y).count("1") for x, y in zip(a, b))

    @staticmethod
    def detect_key_length(data: bytes, max_len: int = 32) -> list[int]:
        """
        Use normalized Hamming distance to detect likely XOR key lengths.
        Returns top 5 guesses sorted by likelihood (lowest distance = best).
        """
        scores: list[tuple[float, int]] = []
        for kl in range(2, min(max_len + 1, len(data) // 4)):
            blocks = [data[i * kl: (i + 1) * kl] for i in range(4)]
            distances = []
            for i in range(len(blocks)):
                for j in range(i + 1, len(blocks)):
                    if len(blocks[i]) == len(blocks[j]):
                        dist = XorTool._hamming_distance(blocks[i], blocks[j])
                        distances.append(dist / kl)
            if distances:
                avg = sum(distances) / len(distances)
                scores.append((avg, kl))
        scores.sort(key=lambda x: x[0])
        return [kl for _, kl in scores[:5]]

    @staticmethod
    def multibyte_brute(data: bytes, key_length: int) -> bytes:
        """
        Brute-force a known-length XOR key using frequency analysis.
        Splits data into key_length streams and finds best single-byte key for each.
        """
        key = bytearray()
        for i in range(key_length):
            stream = bytes(data[j] for j in range(i, len(data), key_length))
            best = XorTool.single_byte_brute(stream)
            if best:
                key.append(best[0]["key"])
            else:
                key.append(0)
        return bytes(key)

    async def analyze(self, hex_data: str, **kwargs) -> JobResult:
        return await self.run(hex_data=hex_data, **kwargs)
