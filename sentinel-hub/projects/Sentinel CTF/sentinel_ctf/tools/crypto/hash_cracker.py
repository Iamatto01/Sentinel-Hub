"""
sentinel_ctf.tools.crypto.hash_cracker
========================================
Hash identification and cracking via hashcat / john the ripper.
"""
from __future__ import annotations

import hashlib
import re

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# hashcat mode map
_HASHCAT_MODES: dict[str, int] = {
    "md5": 0, "md5crypt": 500, "sha1": 100, "sha224": 1300, "sha256": 1400,
    "sha384": 10800, "sha512": 1700, "ntlm": 1000, "bcrypt": 3200,
    "mysql": 300, "sha512crypt": 1800, "whirlpool": 6100,
    "md4": 900, "sha3_256": 17300, "sha3_512": 17600,
}
_JOHN_FORMATS: dict[str, str] = {
    "md5": "raw-md5", "sha1": "raw-sha1", "sha256": "raw-sha256",
    "sha512": "raw-sha512", "ntlm": "nt", "bcrypt": "bcrypt",
    "md5crypt": "md5crypt", "sha512crypt": "sha512crypt",
}

# Top 50 most common passwords (rockyou subset)
_COMMON_PASSWORDS: list[str] = [
    "123456", "password", "12345678", "qwerty", "123456789", "12345",
    "1234", "111111", "1234567", "dragon", "123123", "baseball",
    "abc123", "football", "monkey", "letmein", "shadow", "master",
    "666666", "qwertyuiop", "123321", "mustang", "1234567890", "michael",
    "654321", "superman", "1qaz2wsx", "7777777", "121212", "000000",
    "qazwsx", "123qwe", "killer", "trustno1", "jordan", "jennifer",
    "zxcvbnm", "asdfgh", "hunter", "buster", "soccer", "harley",
    "batman", "andrew", "tigger", "sunshine", "iloveyou", "2000",
    "charlie", "robert",
]


class HashCrackerTool(BaseTool):
    name = "hashcrack"
    description = "Hash cracking via hashcat and john the ripper"

    def build_command(
        self,
        hash_value: str,
        hash_type: str = "md5",
        wordlist: str = "/usr/share/wordlists/rockyou.txt",
        rules: str = "",
        extra_flags: str = "",
        use_john: bool = False,
        **kwargs,
    ) -> str:
        hash_value = hash_value.strip()
        ht = hash_type.lower()

        if use_john:
            fmt = _JOHN_FORMATS.get(ht, "raw-" + ht)
            # Write hash to temp file then crack
            safe_hash = hash_value[:16].replace("$", "S")
            return (
                f"echo {hash_value!r} > /tmp/hash_{safe_hash}.txt && "
                f"john --format={fmt} --wordlist={wordlist} /tmp/hash_{safe_hash}.txt"
            )
        else:
            mode = _HASHCAT_MODES.get(ht, 0)
            parts = [
                f"hashcat -m {mode}",
                hash_value,
                wordlist,
                "--potfile-disable",
                "--quiet",
                "--status",
            ]
            if rules:
                parts.append(f"-r {rules}")
            if extra_flags:
                parts.append(extra_flags)
            return " ".join(parts)

    def parse(self, result: ExecResult) -> dict:
        out = (result.stdout or "") + (result.stderr or "")
        cracked = None

        # hashcat format: HASH:plaintext
        for line in out.splitlines():
            if ":" in line and not line.startswith("[") and not line.startswith("Session"):
                parts = line.split(":")
                if len(parts) >= 2:
                    candidate = parts[-1].strip()
                    if candidate and len(candidate) < 200:
                        cracked = candidate
                        break

        # john format: plaintext (HASH)
        john_match = re.search(r"^(\S+)\s+\(", out, re.M)
        if john_match and not cracked:
            cracked = john_match.group(1)

        flags_found = re.findall(r"flag\{[^}]+\}", cracked or "", re.I)

        return {
            "cracked": cracked,
            "flags_found": flags_found,
            "raw_output": out[:1000],
        }

    @staticmethod
    def identify_hash(h: str) -> list[str]:
        """Identify possible hash types based on length and character set."""
        h = h.strip()
        length = len(h)
        is_hex = bool(re.match(r"^[0-9a-fA-F]+$", h))
        is_b64 = bool(re.match(r"^[A-Za-z0-9+/=]+$", h))

        candidates = []
        if is_hex:
            if length == 32:   candidates += ["MD5", "NTLM", "MD4"]
            if length == 40:   candidates += ["SHA1", "MySQL4"]
            if length == 56:   candidates += ["SHA224"]
            if length == 64:   candidates += ["SHA256"]
            if length == 96:   candidates += ["SHA384"]
            if length == 128:  candidates += ["SHA512", "Whirlpool"]
        if h.startswith("$2b$") or h.startswith("$2y$") or h.startswith("$2a$"):
            candidates = ["bcrypt"]
        if h.startswith("$1$"):
            candidates = ["md5crypt"]
        if h.startswith("$6$"):
            candidates = ["sha512crypt"]
        if h.startswith("$5$"):
            candidates = ["sha256crypt"]
        if h.startswith("$apr1$"):
            candidates = ["apr1"]
        if not candidates and is_b64 and length in (24, 28, 44, 88):
            candidates = ["Base64-encoded hash — decode first"]
        return candidates or ["Unknown — try hashid or hash-identifier"]

    @staticmethod
    def try_common(h: str) -> str | None:
        """Try cracking hash against common passwords. Returns plaintext or None."""
        h = h.strip().lower()
        for pw in _COMMON_PASSWORDS:
            for algo, fn in [
                ("md5", lambda p: hashlib.md5(p.encode()).hexdigest()),
                ("sha1", lambda p: hashlib.sha1(p.encode()).hexdigest()),
                ("sha256", lambda p: hashlib.sha256(p.encode()).hexdigest()),
                ("ntlm", lambda p: hashlib.new("md4", p.encode("utf-16-le")).hexdigest()),
            ]:
                try:
                    if fn(pw) == h:
                        return pw
                except Exception:
                    pass
        return None

    async def crack(self, hash_value: str, **kwargs) -> JobResult:
        return await self.run(hash_value=hash_value, **kwargs)
