"""
sentinel_ctf.tools.crypto.aes_tool
=====================================
AES mode analysis, ECB detection, CBC padding oracle helpers, and
general AES encryption/decryption.

Runs entirely locally using pycryptodome — no Kali executor required.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class AesTool(BaseTool):
    """
    AES mode analysis tool.

    Provides:
    - ECB block-repeat detection.
    - CBC bit-flip payload computation.
    - PKCS#7 padding helpers.
    - Generic decrypt/encrypt one-liners via subprocess.
    - An async ``analyze()`` shortcut.
    """

    name: str = "aes"
    description: str = "AES mode analysis, ECB detection, CBC padding oracle helper"

    # ------------------------------------------------------------------
    # BaseTool interface
    # ------------------------------------------------------------------

    def build_command(
        self,
        data_hex: str,
        key_hex: str = "",
        mode: str = "detect",
        iv_hex: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build a ``python3 -c`` one-liner for the requested AES operation.

        Parameters
        ----------
        data_hex:
            Hex-encoded ciphertext (or plaintext for encrypt mode).
        key_hex:
            Hex-encoded AES key (required for decrypt/encrypt modes).
        mode:
            One of ``'detect'`` (ECB check), ``'decrypt'``, or ``'encrypt'``.
        iv_hex:
            Hex-encoded IV for CBC mode.  Defaults to 16 null bytes when
            not provided.

        Returns
        -------
        str
            Shell command string.

        Raises
        ------
        ValueError
            If an unsupported *mode* is requested.
        """
        data_hex = data_hex.strip().lower()
        key_hex = key_hex.strip().lower()
        iv_hex = iv_hex.strip().lower()

        if mode == "detect":
            return (
                f"python3 -c \""
                f"data=bytes.fromhex('{data_hex}'); "
                f"blocks=[data[i:i+16] for i in range(0,len(data),16)]; "
                f"from collections import Counter; "
                f"cnt=Counter(blocks); "
                f"repeats=[(blk.hex(),n) for blk,n in cnt.items() if n>1]; "
                f"is_ecb=len(repeats)>0; "
                f"print('ECB_DETECTED:', is_ecb); "
                f"[print('REPEATED_BLOCK:', b, 'x', n) for b,n in repeats]\""
            )

        if not key_hex:
            raise ValueError(f"key_hex is required for mode='{mode}'")

        # Determine AES mode constant
        if iv_hex:
            aes_mode = "AES.MODE_CBC"
            iv_arg = f"iv=bytes.fromhex('{iv_hex}')"
        else:
            aes_mode = "AES.MODE_ECB"
            iv_arg = ""

        iv_constructor = f", {iv_arg}" if iv_arg else ""

        if mode == "decrypt":
            return (
                f"python3 -c \""
                f"from Crypto.Cipher import AES; "
                f"from Crypto.Util.Padding import unpad; "
                f"cipher=AES.new(bytes.fromhex('{key_hex}'), {aes_mode}{iv_constructor}); "
                f"ct=bytes.fromhex('{data_hex}'); "
                f"pt=cipher.decrypt(ct); "
                f"print('HEX:', pt.hex()); "
                f"print('TEXT:', pt.decode('utf-8', errors='replace'))\""
            )

        if mode == "encrypt":
            return (
                f"python3 -c \""
                f"from Crypto.Cipher import AES; "
                f"from Crypto.Util.Padding import pad; "
                f"cipher=AES.new(bytes.fromhex('{key_hex}'), {aes_mode}{iv_constructor}); "
                f"pt=bytes.fromhex('{data_hex}'); "
                f"ct=cipher.encrypt(pad(pt, 16)); "
                f"print('HEX:', ct.hex())\""
            )

        raise ValueError(f"Unknown mode '{mode}'. Use 'detect', 'decrypt', or 'encrypt'.")

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse the output of :meth:`build_command`.

        Returns
        -------
        dict with keys:
            - ``mode_detected``   – str description of the detected/used mode
            - ``is_ecb``          – bool, True if ECB repeated blocks found
            - ``repeated_blocks`` – list of repeated block hex strings
            - ``decrypted_hex``   – hex of decrypted plaintext
            - ``decrypted_text``  – UTF-8 decoded plaintext
            - ``flags_found``     – list of flag strings
        """
        out = result.stdout or ""
        is_ecb = False
        repeated_blocks: list[str] = []
        decrypted_hex = ""
        decrypted_text = ""

        for line in out.splitlines():
            line = line.strip()

            if line.startswith("ECB_DETECTED:"):
                val = line.split(":", 1)[1].strip()
                is_ecb = val.lower() == "true"

            elif line.startswith("REPEATED_BLOCK:"):
                # REPEATED_BLOCK: <hex> x <count>
                m = re.match(r"REPEATED_BLOCK:\s+([0-9a-f]+)\s+x\s+(\d+)", line, re.IGNORECASE)
                if m:
                    repeated_blocks.append(m.group(1))

            elif line.startswith("HEX:"):
                decrypted_hex = line.split(":", 1)[1].strip()

            elif line.startswith("TEXT:"):
                decrypted_text = line.split(":", 1)[1].strip()

        mode_detected: str
        if is_ecb:
            mode_detected = "ECB (repeated blocks detected)"
        elif decrypted_hex:
            mode_detected = "CBC/ECB (decrypted)"
        else:
            mode_detected = "Unknown / no repeated blocks"

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.IGNORECASE)
        if decrypted_text:
            flags_found += re.findall(r"flag\{[^}]+\}", decrypted_text, re.IGNORECASE)
        flags_found = list(set(flags_found))

        return {
            "mode_detected": mode_detected,
            "is_ecb": is_ecb,
            "repeated_blocks": repeated_blocks,
            "decrypted_hex": decrypted_hex,
            "decrypted_text": decrypted_text,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Pure-Python static methods
    # ------------------------------------------------------------------

    @staticmethod
    def detect_ecb(ciphertext: bytes) -> bool:
        """
        Return ``True`` if any 16-byte block appears more than once in
        *ciphertext*, which is a strong indicator of ECB mode.

        Parameters
        ----------
        ciphertext:
            Raw ciphertext bytes.

        Returns
        -------
        bool
        """
        if len(ciphertext) < 32:
            return False
        blocks = [ciphertext[i: i + 16] for i in range(0, len(ciphertext), 16)]
        return len(blocks) != len(set(blocks))

    @staticmethod
    def repeated_blocks(ciphertext: bytes, block_size: int = 16) -> list[bytes]:
        """
        Return a list of every block that appears more than once.

        Parameters
        ----------
        ciphertext:
            Raw ciphertext bytes.
        block_size:
            Block size in bytes (default 16 for AES).

        Returns
        -------
        list[bytes]
            Distinct blocks that are repeated, in order of first occurrence.
        """
        blocks = [ciphertext[i: i + block_size] for i in range(0, len(ciphertext), block_size)]
        counts = Counter(blocks)
        seen: set[bytes] = set()
        result: list[bytes] = []
        for blk in blocks:
            if counts[blk] > 1 and blk not in seen:
                result.append(blk)
                seen.add(blk)
        return result

    @staticmethod
    def cbc_bitflip(
        iv: bytes,
        ciphertext: bytes,
        target_block_idx: int,
        known_plaintext: bytes,
        target_plaintext: bytes,
    ) -> bytes:
        """
        Compute a bit-flipped ciphertext for a CBC padding-oracle / bit-flip attack.

        In CBC decryption, modifying byte ``i`` of ciphertext block ``n-1``
        flips the corresponding byte of plaintext block ``n``.  This method
        XORs the appropriate prior ciphertext block to transform
        ``known_plaintext`` into ``target_plaintext`` in plaintext block
        ``target_block_idx``.

        The attack targets bytes at the *same offset* within the block as
        the bytes in ``known_plaintext`` / ``target_plaintext``.

        Parameters
        ----------
        iv:
            Original IV (16 bytes).
        ciphertext:
            Original ciphertext bytes (multiple of 16).
        target_block_idx:
            Index (0-based) of the plaintext block to flip.  Must be ≥ 1
            (block 0 is flipped by modifying the IV).
        known_plaintext:
            Bytes we know appear at the start of plaintext block
            ``target_block_idx``.  Must be ≤ 16 bytes.
        target_plaintext:
            Bytes we want to appear instead.  Must be the same length as
            ``known_plaintext``.

        Returns
        -------
        bytes
            Modified ciphertext bytes (same total length as input).

        Raises
        ------
        ValueError
            On mismatched lengths or out-of-range block index.
        """
        if len(known_plaintext) != len(target_plaintext):
            raise ValueError("known_plaintext and target_plaintext must have the same length.")
        if target_block_idx < 1:
            raise ValueError("target_block_idx must be >= 1 (for IV flip, modify iv directly).")
        n = len(known_plaintext)
        if n > 16:
            raise ValueError("known_plaintext must be <= 16 bytes (one block).")

        # The block we need to modify is the *previous* ciphertext block
        prev_block_idx = target_block_idx - 1
        block_size = 16

        # Build mutable copy
        combined = bytearray(iv + ciphertext)
        offset = prev_block_idx * block_size

        for i in range(n):
            combined[offset + i] ^= known_plaintext[i] ^ target_plaintext[i]

        # Return just the (possibly-modified IV +) ciphertext without IV
        return bytes(combined[16:])

    @staticmethod
    def pkcs7_pad(data: bytes, block_size: int = 16) -> bytes:
        """
        Apply PKCS#7 padding to *data* to align to *block_size*.

        Parameters
        ----------
        data:
            Input bytes.
        block_size:
            Target block size (1–255).

        Returns
        -------
        bytes
            Padded bytes whose length is a multiple of *block_size*.
        """
        pad_len = block_size - (len(data) % block_size)
        return data + bytes([pad_len] * pad_len)

    @staticmethod
    def pkcs7_unpad(data: bytes) -> bytes:
        """
        Remove PKCS#7 padding from *data*.

        Parameters
        ----------
        data:
            Padded bytes.

        Returns
        -------
        bytes
            Unpadded bytes.

        Raises
        ------
        ValueError
            If the padding is invalid (zero pad byte, pad length exceeds
            data length, or inconsistent trailing bytes).
        """
        if not data:
            raise ValueError("Empty data cannot be unpadded.")
        pad_len = data[-1]
        if pad_len == 0 or pad_len > len(data):
            raise ValueError(f"Invalid PKCS#7 padding byte: {pad_len!r}")
        if data[-pad_len:] != bytes([pad_len] * pad_len):
            raise ValueError("Invalid PKCS#7 padding — trailing bytes are inconsistent.")
        return data[:-pad_len]

    @staticmethod
    def try_decrypt(
        data_hex: str,
        key_hex: str,
        iv_hex: str = "",
        mode: str = "CBC",
    ) -> bytes:
        """
        Attempt AES decryption without spawning a subprocess.

        Requires ``pycryptodome`` (``pip install pycryptodome``).

        Parameters
        ----------
        data_hex:
            Hex-encoded ciphertext.
        key_hex:
            Hex-encoded AES key (16, 24, or 32 bytes).
        iv_hex:
            Hex-encoded IV.  Required for CBC.  If empty and mode is CBC,
            16 null bytes are used.
        mode:
            ``'CBC'`` or ``'ECB'``.

        Returns
        -------
        bytes
            Decrypted raw bytes (PKCS#7 padding is stripped if valid).

        Raises
        ------
        ImportError
            If ``pycryptodome`` is not installed.
        ValueError
            On invalid hex strings or decryption errors.
        """
        try:
            from Crypto.Cipher import AES  # type: ignore[import]
        except ImportError as exc:
            raise ImportError(
                "pycryptodome is required: pip install pycryptodome"
            ) from exc

        key = bytes.fromhex(key_hex.strip())
        ct = bytes.fromhex(data_hex.strip())

        if mode.upper() == "CBC":
            iv = bytes.fromhex(iv_hex.strip()) if iv_hex.strip() else b"\x00" * 16
            cipher = AES.new(key, AES.MODE_CBC, iv=iv)
        elif mode.upper() == "ECB":
            cipher = AES.new(key, AES.MODE_ECB)
        else:
            raise ValueError(f"Unsupported mode '{mode}'. Use 'CBC' or 'ECB'.")

        raw = cipher.decrypt(ct)

        # Attempt PKCS#7 unpadding; return raw bytes on failure
        try:
            return AesTool.pkcs7_unpad(raw)
        except ValueError:
            return raw

    # ------------------------------------------------------------------
    # Async shortcut
    # ------------------------------------------------------------------

    async def analyze(self, data_hex: str, **kwargs: Any) -> JobResult:
        """
        Async shortcut that builds the command, executes it, and returns
        a structured :class:`~sentinel_ctf.core.models.JobResult`.

        Pass ``mode='detect'`` (default) for ECB analysis, or
        ``mode='decrypt'`` with ``key_hex`` and optionally ``iv_hex``
        for decryption.

        Parameters
        ----------
        data_hex:
            Hex-encoded data to analyse.
        **kwargs:
            Forwarded to :meth:`build_command` and the executor.

        Returns
        -------
        JobResult
        """
        return await self.run(data_hex=data_hex, **kwargs)
