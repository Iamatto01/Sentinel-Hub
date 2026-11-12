"""
sentinel_ctf.tools.crypto.rsa_tool
=====================================
RSA attack automation — wraps RsaCtfTool + pure-Python manual attacks.
"""
from __future__ import annotations

import math
import re
from fractions import Fraction

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class RsaTool(BaseTool):
    name = "rsa"
    description = "RSA attack automation (RsaCtfTool wrapper + manual attacks)"

    def build_command(
        self,
        n: str = "",
        e: str = "65537",
        c: str = "",
        pubkey_file: str = "",
        ct_file: str = "",
        attack: str = "all",
        **kwargs,
    ) -> str:
        if pubkey_file:
            parts = [f"python3 -m RsaCtfTool --publickey {pubkey_file}"]
            if ct_file:
                parts.append(f"--uncipherfile {ct_file}")
        else:
            parts = [f"python3 -m RsaCtfTool -n {n} -e {e}"]
            if c:
                parts.append(f"--uncipher {c}")
        parts.append(f"--attack {attack}")
        return " ".join(parts)

    def parse(self, result: ExecResult) -> dict:
        out = (result.stdout or "") + (result.stderr or "")

        # Plaintext extraction
        plaintext = None
        for pattern in [
            r"Decrypted value.*?:\s*(.+)",
            r"HEX\s*:\s*([0-9a-fA-F]+)",
            r"INT\s*:\s*(\d+)",
            r"STR\s*:\s*(.+)",
        ]:
            m = re.search(pattern, out, re.I)
            if m:
                plaintext = m.group(1).strip()
                break

        # Factor extraction
        p_vals = re.findall(r"p\s*=\s*(\d+)", out)
        q_vals = re.findall(r"q\s*=\s*(\d+)", out)

        # Attack used
        attack_match = re.search(r"Attack:\s*(\w+)", out, re.I)

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)
        if plaintext:
            flags_found += re.findall(r"flag\{[^}]+\}", plaintext, re.I)

        return {
            "plaintext": plaintext,
            "factors_found": {"p": p_vals[0] if p_vals else None, "q": q_vals[0] if q_vals else None},
            "attack_used": attack_match.group(1) if attack_match else None,
            "flags_found": list(set(flags_found)),
            "raw": out[:2000],
        }

    # ------------------------------------------------------------------
    # Pure-Python static attack methods
    # ------------------------------------------------------------------

    @staticmethod
    def small_e_attack(n: int, e: int, c: int) -> int | None:
        """
        Small-exponent attack: if e is small and m^e < n, then m = c^(1/e).
        Works best for e=3 with small messages.
        """
        # Try integer eth root
        root = round(c ** (1 / e))
        for candidate in range(max(0, root - 100), root + 100):
            if pow(candidate, e) == c:
                return candidate
        # Newton's method for large numbers
        x = c
        while True:
            x_new = ((e - 1) * x + c // pow(x, e - 1)) // e
            if x_new >= x:
                break
            x = x_new
        if pow(x, e) == c:
            return x
        return None

    @staticmethod
    def fermat_factor(n: int, max_iter: int = 100_000) -> tuple[int, int] | None:
        """
        Fermat's factorization: works when p and q are close together.
        Returns (p, q) or None if not found within max_iter.
        """
        if n % 2 == 0:
            return (2, n // 2)
        a = math.isqrt(n)
        if a * a == n:
            return (a, a)
        a += 1
        for _ in range(max_iter):
            b2 = a * a - n
            b = math.isqrt(b2)
            if b * b == b2:
                p, q = a - b, a + b
                if p * q == n:
                    return (p, q)
            a += 1
        return None

    @staticmethod
    def _extended_gcd(a: int, b: int) -> tuple[int, int, int]:
        """Extended Euclidean algorithm. Returns (gcd, x, y) where a*x + b*y = gcd."""
        if a == 0:
            return b, 0, 1
        gcd, x1, y1 = RsaTool._extended_gcd(b % a, a)
        return gcd, y1 - (b // a) * x1, x1

    @staticmethod
    def common_modulus_attack(n: int, e1: int, c1: int, e2: int, c2: int) -> int | None:
        """
        Common modulus attack: same n, different e, same message.
        Requires gcd(e1, e2) = 1.
        """
        gcd, a, b = RsaTool._extended_gcd(e1, e2)
        if gcd != 1:
            return None
        # m = c1^a * c2^b mod n
        if a < 0:
            c1 = pow(c1, -1, n)
            a = -a
        if b < 0:
            c2 = pow(c2, -1, n)
            b = -b
        m = (pow(c1, a, n) * pow(c2, b, n)) % n
        return m

    @staticmethod
    def wiener_attack(n: int, e: int) -> int | None:
        """
        Wiener's attack for small private exponent d (d < n^0.25).
        Uses continued fraction expansion of e/n.
        Returns d if found, else None.
        """
        def convergents(n: int, d: int):
            """Generate convergents of continued fraction for n/d."""
            while d:
                a = n // d
                yield a
                n, d = d, n - a * d

        h0, h1 = 0, 1
        k0, k1 = 1, 0
        for a in convergents(e, n):
            h0, h1 = h1, h0 + a * h1
            k0, k1 = k1, k0 + a * k1
            k, h = k1, h0
            if k == 0:
                continue
            # Check if k,h is a valid key pair
            if (e * h - 1) % k == 0:
                phi_candidate = (e * h - 1) // k
                # Verify: x^2 - (n - phi + 1)x + n = 0 has integer roots
                b = n - phi_candidate + 1
                discriminant = b * b - 4 * n
                if discriminant >= 0:
                    sqrt_disc = math.isqrt(discriminant)
                    if sqrt_disc * sqrt_disc == discriminant:
                        p = (b + sqrt_disc) // 2
                        q = (b - sqrt_disc) // 2
                        if p * q == n:
                            return h
        return None

    @staticmethod
    def decrypt_rsa(p: int, q: int, e: int, c: int) -> bytes:
        """Standard RSA decryption given factors p, q."""
        phi = (p - 1) * (q - 1)
        n = p * q
        d = pow(e, -1, phi)
        m = pow(c, d, n)
        byte_length = (m.bit_length() + 7) // 8
        return m.to_bytes(byte_length, byteorder="big")

    async def attack(self, **kwargs) -> JobResult:
        return await self.run(**kwargs)
