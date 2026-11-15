#!/usr/bin/env python3
"""
Sentinel CTF Framework — Misc Template
=======================================
multi_decoder.py  ·  Multi-Encoding / Multi-Layer Decoder

Tries every common CTF encoding, detects recursive encoding (up to 5
layers deep), and highlights any layer that produces a flag.

Usage
-----
    python multi_decoder.py --data "SGVsbG8gV29ybGQ="
    echo "SGVsbG8gV29ybGQ=" | python multi_decoder.py
    python multi_decoder.py --data "01100110 01101100 01100001 01100111"

Author  : Sentinel CTF Framework
License : MIT
"""

from __future__ import annotations

import argparse
import base64
import binascii
import gzip
import io
import re
import string
import sys
import zlib
from html import unescape as html_unescape
from typing import Optional
from urllib.parse import unquote as url_unquote

# ---------------------------------------------------------------------------
# Rich console (optional)
# ---------------------------------------------------------------------------
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text

    console = Console(highlight=False)
    RICH = True
except ImportError:
    RICH = False

    class _FallbackConsole:  # noqa: D101
        def print(self, *a, **kw):  # noqa: D102
            text = " ".join(str(x) for x in a)
            text = re.sub(r"\[/?[^\]]+\]", "", text)
            print(text)

        def rule(self, title="", **kw):  # noqa: D102
            print(f"\n{'─'*60}  {title}")

    console = _FallbackConsole()

# ---------------------------------------------------------------------------
# Flag regex
# ---------------------------------------------------------------------------
FLAG_REGEX = re.compile(
    r"(?:flag|FLAG|CTF|ctf|HTB|picoCTF|DUCTF|nahamCTF)\{[^}]{3,}\}",
    re.IGNORECASE,
)

# A common English word list subset for ROT scoring
ENGLISH_WORDS: frozenset[str] = frozenset(
    "the and for are but not you all can had her "
    "was one our out day get has him his how man "
    "new now old see two way who boy did its let "
    "put say she too use that with have this will "
    "your from they know want been good much some "
    "time very when come here just like long make "
    "many more only over such take than them well "
    "were what able about above after again".split()
)

MAX_DEPTH = 5  # Maximum recursive decode depth

# ---------------------------------------------------------------------------
# Morse code lookup table
# ---------------------------------------------------------------------------
MORSE_TABLE: dict[str, str] = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E",
    "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
    "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O",
    ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
    "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y",
    "--..": "Z", "-----": "0", ".----": "1", "..---": "2",
    "...--": "3", "....-": "4", ".....": "5", "-....": "6",
    "--...": "7", "---..": "8", "----.": "9",
    ".-.-.-": ".", "--..--": ",", "..--..": "?",
}

# Bacon cipher A=AAAAA … Z=BBAAB
BACON_TABLE: dict[str, str] = {}
_bacon_alphabet = "ABCDEFGHIKLMNOPQRSTUWXYZ"  # Note: IJ and UV are combined classically
for _i, _ch in enumerate(_bacon_alphabet):
    _code = format(_i, "05b").replace("0", "A").replace("1", "B")
    BACON_TABLE[_code] = _ch


# ---------------------------------------------------------------------------
# Individual encoding decoders
# ---------------------------------------------------------------------------


def try_base64(data: str) -> Optional[str]:
    """Decode standard Base64."""
    try:
        padded = data.strip() + "=" * ((-len(data.strip())) % 4)
        decoded = base64.b64decode(padded)
        return decoded.decode("utf-8", errors="strict")
    except Exception:
        return None


def try_base64url(data: str) -> Optional[str]:
    """Decode URL-safe Base64 (+ → -, / → _)."""
    try:
        padded = data.strip().replace("+", "-").replace("/", "_")
        padded += "=" * ((-len(padded)) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        return decoded.decode("utf-8", errors="strict")
    except Exception:
        return None


def try_base32(data: str) -> Optional[str]:
    """Decode Base32."""
    try:
        padded = data.strip().upper() + "=" * ((-len(data.strip())) % 8)
        decoded = base64.b32decode(padded)
        return decoded.decode("utf-8", errors="strict")
    except Exception:
        return None


def try_base16(data: str) -> Optional[str]:
    """Decode Base16 (hex, uppercase)."""
    try:
        decoded = base64.b16decode(data.strip().upper())
        return decoded.decode("utf-8", errors="strict")
    except Exception:
        return None


def try_hex(data: str) -> Optional[str]:
    """Decode plain hex string (with or without spaces / 0x prefixes)."""
    try:
        cleaned = re.sub(r"0x|\\x|\s|:", "", data.strip())
        decoded = bytes.fromhex(cleaned)
        return decoded.decode("utf-8", errors="strict")
    except Exception:
        return None


def try_url(data: str) -> Optional[str]:
    """URL-decode."""
    try:
        decoded = url_unquote(data.strip())
        if decoded != data.strip():
            return decoded
        return None
    except Exception:
        return None


def try_html(data: str) -> Optional[str]:
    """HTML entity decode."""
    try:
        decoded = html_unescape(data.strip())
        if decoded != data.strip():
            return decoded
        return None
    except Exception:
        return None


def try_rot(data: str) -> list[tuple[str, str]]:
    """Try all 25 ROT-N shifts; return list of (encoding_name, decoded)."""
    results = []
    clean = data.strip()
    for n in range(1, 26):
        decoded = _rot_n(clean, n)
        if decoded != clean:
            results.append((f"ROT{n}", decoded))
    return results


def _rot_n(text: str, n: int) -> str:
    """Apply ROT-N to all alpha characters."""
    result = []
    for ch in text:
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            result.append(chr((ord(ch) - base + n) % 26 + base))
        else:
            result.append(ch)
    return "".join(result)


def score_english(text: str) -> int:
    """Score a text by counting English dictionary words (for ROT ranking)."""
    words = re.findall(r"[a-z]+", text.lower())
    return sum(1 for w in words if w in ENGLISH_WORDS)


def try_atbash(data: str) -> Optional[str]:
    """Atbash cipher (A↔Z, B↔Y …)."""
    result = []
    for ch in data.strip():
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            result.append(chr(base + 25 - (ord(ch) - base)))
        else:
            result.append(ch)
    decoded = "".join(result)
    return decoded if decoded != data.strip() else None


def try_morse(data: str) -> Optional[str]:
    """Decode Morse code (. - / as word separator)."""
    try:
        clean = data.strip()
        words = clean.split("  ") if "  " in clean else clean.split(" / ")
        decoded_words = []
        for word in words:
            chars = word.strip().split()
            decoded_word = ""
            for char in chars:
                decoded_word += MORSE_TABLE.get(char, "?")
            decoded_words.append(decoded_word)
        result = " ".join(decoded_words)
        if "?" not in result and result != data.strip():
            return result
        return None
    except Exception:
        return None


def try_binary(data: str) -> Optional[str]:
    """Decode space-separated 8-bit binary string."""
    try:
        clean = data.strip()
        # Accept binary with or without spaces
        tokens = clean.split() if " " in clean else [clean[i:i+8] for i in range(0, len(clean), 8)]
        if not all(re.fullmatch(r"[01]{8}", t) for t in tokens):
            return None
        decoded = bytes(int(t, 2) for t in tokens).decode("utf-8", errors="strict")
        return decoded
    except Exception:
        return None


def try_bacon(data: str) -> Optional[str]:
    """Decode Baconian cipher (AAAAA…BBAAB)."""
    try:
        clean = re.sub(r"[^AB]", "", data.strip().upper())
        if len(clean) % 5 != 0:
            return None
        groups = [clean[i:i+5] for i in range(0, len(clean), 5)]
        decoded = "".join(BACON_TABLE.get(g, "?") for g in groups)
        if "?" not in decoded:
            return decoded
        return None
    except Exception:
        return None


def try_ascii_codes(data: str) -> Optional[str]:
    """Decode space-separated decimal ASCII codes."""
    try:
        clean = data.strip()
        nums = [int(x) for x in re.split(r"[\s,]+", clean) if x]
        if not all(32 <= n <= 126 for n in nums):
            return None
        return "".join(chr(n) for n in nums)
    except Exception:
        return None


def try_reverse(data: str) -> Optional[str]:
    """Reverse the string."""
    rev = data.strip()[::-1]
    return rev if rev != data.strip() else None


def try_unicode_escapes(data: str) -> Optional[str]:
    """Decode \\uXXXX and \\UXXXXXXXX unicode escapes."""
    try:
        if r"\u" not in data and r"\U" not in data:
            return None
        decoded = data.encode("utf-8").decode("unicode_escape")
        return decoded if decoded != data else None
    except Exception:
        return None


def try_zlib_after_base64(data: str) -> Optional[str]:
    """Decode base64 then zlib decompress."""
    try:
        raw = base64.b64decode(data.strip() + "=" * ((-len(data.strip())) % 4))
        decompressed = zlib.decompress(raw)
        return decompressed.decode("utf-8", errors="strict")
    except Exception:
        return None


def try_gzip(data: str) -> Optional[str]:
    """Detect and decompress gzip data (raw bytes starting with 1f8b)."""
    try:
        # Accept hex-encoded gzip or raw
        cleaned = data.strip()
        if cleaned.startswith("1f8b") or cleaned.startswith("\\x1f\\x8b"):
            raw = bytes.fromhex(re.sub(r"\\x|0x|\s", "", cleaned))
        else:
            # Try base64 decode first
            raw = base64.b64decode(cleaned + "=" * ((-len(cleaned)) % 4))
        if raw[:2] != b"\x1f\x8b":
            return None
        decompressed = gzip.decompress(raw)
        return decompressed.decode("utf-8", errors="strict")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Master decode engine
# ---------------------------------------------------------------------------


def run_all_decoders(data: str) -> list[dict]:
    """Run every decoder on *data*; return list of {encoding, result} dicts."""
    results: list[dict] = []

    def _add(encoding: str, result: Optional[str]) -> None:
        if result and result.strip() and result.strip() != data.strip():
            # Only add if meaningfully different
            printable = sum(1 for c in result if c.isprintable())
            if printable / max(len(result), 1) > 0.6:
                results.append({"encoding": encoding, "result": result})

    _add("base64",         try_base64(data))
    _add("base64url",      try_base64url(data))
    _add("base32",         try_base32(data))
    _add("base16",         try_base16(data))
    _add("hex",            try_hex(data))
    _add("url",            try_url(data))
    _add("html",           try_html(data))
    _add("atbash",         try_atbash(data))
    _add("morse",          try_morse(data))
    _add("binary",         try_binary(data))
    _add("bacon",          try_bacon(data))
    _add("ascii_codes",    try_ascii_codes(data))
    _add("reverse",        try_reverse(data))
    _add("unicode_escape", try_unicode_escapes(data))
    _add("zlib+base64",    try_zlib_after_base64(data))
    _add("gzip",           try_gzip(data))

    # ROT: try all 25 shifts, ranked by English word count
    rot_results = try_rot(data)
    rot_results.sort(key=lambda x: -score_english(x[1]))
    for enc_name, decoded in rot_results:
        _add(enc_name, decoded)

    return results


# ---------------------------------------------------------------------------
# Recursive decoder (up to MAX_DEPTH layers)
# ---------------------------------------------------------------------------


def decode_recursive(
    data: str,
    depth: int = 0,
    chain: list[str] | None = None,
) -> list[dict]:
    """Recursively decode *data*, building an encoding chain.

    Returns a list of {chain, result, flag} dicts for every terminal result.
    """
    if chain is None:
        chain = []

    if depth >= MAX_DEPTH:
        return []

    all_findings: list[dict] = []
    decodings = run_all_decoders(data)

    for entry in decodings:
        enc = entry["encoding"]
        result = entry["result"]
        current_chain = chain + [enc]

        has_flag = bool(FLAG_REGEX.search(result))
        all_findings.append({
            "chain": current_chain,
            "result": result,
            "flag": has_flag,
            "depth": depth + 1,
        })

        # Recurse if the result might still be encoded and no flag yet
        looks_encoded = (
            not has_flag
            and len(result) > 4
            and any(
                re.search(pat, result)
                for pat in [
                    r"^[A-Za-z0-9+/=]{16,}$",   # base64-like
                    r"^[0-9a-fA-F\s]{8,}$",       # hex-like
                    r"[.-]{4,}",                  # morse-like
                    r"^[01\s]{16,}$",             # binary-like
                ]
            )
        )
        if looks_encoded:
            deeper = decode_recursive(result, depth + 1, current_chain)
            all_findings.extend(deeper)

    return all_findings


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------


def display_findings(findings: list[dict], original: str) -> None:
    """Print all findings in a rich table."""
    if not findings:
        if RICH:
            console.print("[red]No successful decodings found.[/red]")
        else:
            print("No successful decodings found.")
        return

    if RICH:
        table = Table(title="Decode Results", show_lines=True, expand=False)
        table.add_column("#",       style="dim",   width=4, justify="right")
        table.add_column("Layer",   style="cyan",  width=5, justify="right")
        table.add_column("Chain",   style="magenta", width=30)
        table.add_column("Result",  style="white", width=60, no_wrap=False)
        table.add_column("Flag?",   style="bold",  width=6)

        for i, f in enumerate(findings, 1):
            chain_str = " → ".join(f["chain"])
            result_snippet = f["result"][:200]
            flag_marker = "[bold green]🚩 YES[/bold green]" if f["flag"] else ""
            row_style = "on dark_green" if f["flag"] else ""
            table.add_row(
                str(i),
                str(f["depth"]),
                chain_str[:30],
                result_snippet,
                flag_marker,
                style=row_style,
            )

        console.print(table)
    else:
        print(f"\n{'─'*80}")
        print(f"  {'#':>3}  {'Depth':>5}  {'Chain':<30}  {'Result':<50}  Flag?")
        print(f"{'─'*80}")
        for i, f in enumerate(findings, 1):
            chain_str = " → ".join(f["chain"])[:30]
            result_snippet = f["result"][:50]
            flag_marker = "🚩 YES" if f["flag"] else ""
            print(f"  {i:>3}  {f['depth']:>5}  {chain_str:<30}  {result_snippet:<50}  {flag_marker}")

    # Print flags prominently
    flags = [f for f in findings if f["flag"]]
    if flags:
        if RICH:
            for f in flags:
                m = FLAG_REGEX.search(f["result"])
                if m:
                    console.print(
                        Panel(
                            Text(f"  {m.group(0)}", style="bold green"),
                            title=f"[bold yellow]🚩  FLAG via: {' → '.join(f['chain'])}[/bold yellow]",
                            border_style="bright_green",
                            padding=(1, 4),
                        )
                    )
        else:
            for f in flags:
                m = FLAG_REGEX.search(f["result"])
                if m:
                    print(f"\n{'='*60}")
                    print(f"  🚩  {m.group(0)}  (via: {' → '.join(f['chain'])})")
                    print(f"{'='*60}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Sentinel CTF — Multi-Encoding Decoder",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--data", default=None,
        help="Data to decode (if not provided, reads from stdin)",
    )
    p.add_argument(
        "--depth", type=int, default=MAX_DEPTH, metavar="N",
        help=f"Maximum recursive decode depth (default: {MAX_DEPTH})",
    )
    return p.parse_args()


def main() -> None:
    global MAX_DEPTH
    args = parse_args()
    MAX_DEPTH = args.depth

    if args.data:
        data = args.data
    elif not sys.stdin.isatty():
        data = sys.stdin.read().strip()
    else:
        print("Provide --data or pipe data via stdin. Use --help for options.")
        sys.exit(1)

    if RICH:
        console.print(
            Panel(
                f"[bold]Input:[/bold]     {data[:80]}{'…' if len(data)>80 else ''}\n"
                f"[bold]Length:[/bold]    {len(data)} characters\n"
                f"[bold]Max depth:[/bold] {MAX_DEPTH}",
                title="[bold yellow]Sentinel CTF · Multi-Decoder[/bold yellow]",
                border_style="bright_cyan",
            )
        )

    if RICH:
        console.rule("[bold cyan]Decoding…[/bold cyan]")

    findings = decode_recursive(data)

    # Sort: flags first, then by depth ascending
    findings.sort(key=lambda x: (not x["flag"], x["depth"]))

    display_findings(findings, data)

    if not any(f["flag"] for f in findings):
        if RICH:
            console.print("[yellow]No flag found in any decoded layer.[/yellow]")
        else:
            print("No flag found in any decoded layer.")
        console.print("    • Try manual layer-by-layer decoding")
        console.print("    • Check if ROT result scores high — it may need further decoding")
        console.print("    • Some challenges use Rail Fence or Vigenère — add those manually")


if __name__ == "__main__":
    main()
