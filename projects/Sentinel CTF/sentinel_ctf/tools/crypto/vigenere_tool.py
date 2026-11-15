"""
sentinel_ctf.tools.crypto.vigenere_tool
========================================
Vigenère cipher attack — key length detection via Index of Coincidence
and key recovery via frequency analysis.
Pure Python — no Kali executor required.
"""
from __future__ import annotations

import re
import string
from collections import Counter
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


# English letter frequencies (A–Z), ordered by index 0=A … 25=Z
_ENGLISH_FREQ: list[float] = [
    8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1,
    7.0, 0.15, 0.77, 4.0, 2.4, 6.7, 7.5, 1.9,
    0.10, 6.0, 6.3, 9.1, 2.8, 0.98, 2.4, 0.15,
    2.0, 0.074,
]
# Normalise so they sum to 1
_ENGLISH_FREQ_NORM: list[float] = [f / 100.0 for f in _ENGLISH_FREQ]


class VigenereTool(BaseTool):
    """
    Vigenère cipher attack tool.

    Provides:
    - Index of Coincidence key-length detection (lengths 2–20).
    - Frequency-analysis key recovery once key length is known.
    - Standard encrypt / decrypt helpers.
    - An async ``crack()`` shortcut that runs the full pipeline.
    """

    name: str = "vigenere"
    description: str = "Vigenère cipher attack — key length detection and key recovery"

    # ------------------------------------------------------------------
    # BaseTool interface
    # ------------------------------------------------------------------

    def build_command(
        self,
        ciphertext: str,
        key: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build a python3 one-liner that either decrypts (if *key* is given)
        or runs IC analysis to suggest key lengths.

        Parameters
        ----------
        ciphertext:
            The ciphertext string (letters only for IC; spaces are handled).
        key:
            If provided, decrypt with this key.  Otherwise run IC analysis.

        Returns
        -------
        str
            A shell command string starting with ``python3 -c "…"``.
        """
        # Sanitise for embedding in a shell one-liner
        ct_escaped = ciphertext.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')
        key_escaped = key.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')

        if key:
            return (
                "python3 -c \""
                "import re; "
                f"ct='{ct_escaped}'; key='{key_escaped}'; "
                "letters=[c for c in ct.upper() if c.isalpha()]; "
                "k=[ord(c)-65 for c in key.upper() if c.isalpha()]; "
                "pt=''.join(chr((ord(c)-65-k[i%len(k)])%26+65) for i,c in enumerate(letters)); "
                "print('Decrypted:', pt)\""
            )
        else:
            return (
                "python3 -c \""
                "import re; "
                f"ct='{ct_escaped}'.upper(); "
                "letters=[c for c in ct if c.isalpha()]; "
                "n=len(letters); "
                "results=[]; "
                "[results.append((kl, sum("
                "  (sum((letters[j]==c for j in range(i,n,kl))/max(sum(1 for j in range(i,n,kl)),1))**2 "
                "  for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'"
                ") / max(kl,1))) for kl in range(2,21)]; "
                "results.sort(key=lambda x:-x[1]); "
                "[print(f'KeyLen={kl} IC={ic:.4f}') for kl,ic in results[:5]]\""
            )

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse the output of build_command().

        Returns
        -------
        dict with keys:
            - ``key_candidates`` – list of ``{key_len, ic_score}`` dicts
            - ``decrypted``      – decrypted string when a key was provided
            - ``flags_found``    – list of flag strings
        """
        out = result.stdout or ""
        key_candidates: list[dict] = []
        decrypted: str = ""

        for line in out.splitlines():
            m = re.match(r"KeyLen=(\d+)\s+IC=([\d.]+)", line)
            if m:
                key_candidates.append(
                    {"key_len": int(m.group(1)), "ic_score": float(m.group(2))}
                )
            m2 = re.match(r"Decrypted:\s*(.+)", line)
            if m2:
                decrypted = m2.group(1).strip()

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.IGNORECASE)
        if decrypted:
            flags_found += re.findall(r"flag\{[^}]+\}", decrypted, re.IGNORECASE)
        flags_found = list(set(flags_found))

        return {
            "key_candidates": key_candidates,
            "decrypted": decrypted,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Pure-Python static methods
    # ------------------------------------------------------------------

    @staticmethod
    def index_of_coincidence(text: str) -> float:
        """
        Compute the Index of Coincidence for *text* (letters only).

        IC = Σ n_i*(n_i-1) / (N*(N-1))

        where n_i is the count of each letter and N is the total letter count.
        Returns 0.0 for texts shorter than 2 letters.
        """
        letters = [c for c in text.upper() if c.isalpha()]
        n = len(letters)
        if n < 2:
            return 0.0
        counts = Counter(letters)
        numerator = sum(v * (v - 1) for v in counts.values())
        return numerator / (n * (n - 1))

    @staticmethod
    def find_key_length(ciphertext: str, max_len: int = 20) -> list[tuple[int, float]]:
        """
        For each candidate key length 2..max_len, split the ciphertext into
        that many sub-sequences and compute the average IC across them.
        A higher average IC indicates a more likely key length (English IC ≈ 0.065).

        Returns
        -------
        list[tuple[int, float]]
            Sorted best-first list of ``(key_length, avg_ic)`` tuples.
        """
        letters = [c for c in ciphertext.upper() if c.isalpha()]
        n = len(letters)
        scores: list[tuple[int, float]] = []

        for kl in range(2, min(max_len + 1, n // 2 + 1)):
            sub_ics: list[float] = []
            for start in range(kl):
                sub = [letters[j] for j in range(start, n, kl)]
                sub_ics.append(VigenereTool.index_of_coincidence("".join(sub)))
            avg_ic = sum(sub_ics) / len(sub_ics) if sub_ics else 0.0
            scores.append((kl, avg_ic))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores

    @staticmethod
    def recover_key(ciphertext: str, key_length: int) -> str:
        """
        Recover the Vigenère key of known *key_length* using chi-squared
        frequency analysis against English letter frequencies.

        For each key position i, take every key_length-th ciphertext letter
        starting at i, then find the shift that minimises chi-squared distance
        from English frequencies.

        Returns
        -------
        str
            The recovered key in uppercase.
        """
        letters = [c for c in ciphertext.upper() if c.isalpha()]
        key_chars: list[str] = []

        for i in range(key_length):
            sub = [ord(letters[j]) - 65 for j in range(i, len(letters), key_length)]
            if not sub:
                key_chars.append("A")
                continue

            best_shift = 0
            best_score = float("inf")

            for shift in range(26):
                # Shift sub-sequence as if key byte were 'shift'
                shifted = [(c - shift) % 26 for c in sub]
                counts = Counter(shifted)
                n_sub = len(sub)

                # Chi-squared against English frequencies
                chi2 = sum(
                    (counts.get(idx, 0) / n_sub - _ENGLISH_FREQ_NORM[idx]) ** 2
                    / _ENGLISH_FREQ_NORM[idx]
                    for idx in range(26)
                )
                if chi2 < best_score:
                    best_score = chi2
                    best_shift = shift

            key_chars.append(chr(best_shift + 65))

        return "".join(key_chars)

    @staticmethod
    def decrypt(ciphertext: str, key: str) -> str:
        """
        Standard Vigenère decryption.  Non-letter characters are preserved
        in-place; only letters are shifted.

        Parameters
        ----------
        ciphertext:
            Ciphertext string (may include non-letters).
        key:
            Key string (only alphabetic characters are used).

        Returns
        -------
        str
            Plaintext with the same case mapping as the input ciphertext.
        """
        key_upper = [ord(c) - 65 for c in key.upper() if c.isalpha()]
        if not key_upper:
            return ciphertext

        result: list[str] = []
        key_idx = 0

        for ch in ciphertext:
            if ch.isalpha():
                shift = key_upper[key_idx % len(key_upper)]
                base = 65 if ch.isupper() else 97
                result.append(chr((ord(ch) - base - shift) % 26 + base))
                key_idx += 1
            else:
                result.append(ch)

        return "".join(result)

    @staticmethod
    def encrypt(plaintext: str, key: str) -> str:
        """
        Standard Vigenère encryption.  Non-letter characters are preserved
        in-place.

        Parameters
        ----------
        plaintext:
            Plaintext string.
        key:
            Key string (only alphabetic characters are used).

        Returns
        -------
        str
            Ciphertext with the same case mapping as the input plaintext.
        """
        key_upper = [ord(c) - 65 for c in key.upper() if c.isalpha()]
        if not key_upper:
            return plaintext

        result: list[str] = []
        key_idx = 0

        for ch in plaintext:
            if ch.isalpha():
                shift = key_upper[key_idx % len(key_upper)]
                base = 65 if ch.isupper() else 97
                result.append(chr((ord(ch) - base + shift) % 26 + base))
                key_idx += 1
            else:
                result.append(ch)

        return "".join(result)

    # ------------------------------------------------------------------
    # Async shortcut
    # ------------------------------------------------------------------

    async def crack(self, ciphertext: str, **kwargs: Any) -> JobResult:
        """
        High-level async shortcut.

        If ``key`` is not provided in *kwargs*, automatically:
        1. Detects the top key length candidate via IC.
        2. Recovers the key via frequency analysis.
        3. Decrypts the ciphertext.
        4. Returns a ``JobResult`` with all findings.

        If ``key`` IS provided, simply decrypts and returns.
        """
        key: str = kwargs.pop("key", "")

        if key:
            # Decrypt directly without subprocess
            decrypted = self.decrypt(ciphertext, key)
            flags = re.findall(r"flag\{[^}]+\}", decrypted, re.IGNORECASE)
            parsed: dict[str, Any] = {
                "key_candidates": [],
                "decrypted": decrypted,
                "flags_found": flags,
            }
            return JobResult(
                stdout=decrypted,
                stderr="",
                return_code=0,
                duration_s=0.0,
                parsed=parsed,
                flags_found=flags,
            )

        # Step 1 – detect key length
        kl_scores = self.find_key_length(ciphertext)
        best_kl = kl_scores[0][0] if kl_scores else 3

        # Step 2 – recover key
        recovered_key = self.recover_key(ciphertext, best_kl)

        # Step 3 – decrypt
        decrypted = self.decrypt(ciphertext, recovered_key)

        flags = re.findall(r"flag\{[^}]+\}", decrypted, re.IGNORECASE)
        parsed = {
            "key_candidates": [{"key_len": kl, "ic_score": ic} for kl, ic in kl_scores[:5]],
            "recovered_key": recovered_key,
            "decrypted": decrypted,
            "flags_found": flags,
        }
        return JobResult(
            stdout=decrypted,
            stderr="",
            return_code=0,
            duration_s=0.0,
            parsed=parsed,
            flags_found=flags,
        )
