#!/usr/bin/env python3
"""
Sentinel CTF Framework — Forensics Template
============================================
steg_solver.py  ·  Steganography Analysis Script

Standalone, runnable steganography solver that chains multiple
industry-standard tools and techniques. Runs completely without
the Sentinel framework executor — all tool invocations are raw
subprocess calls so the script can be dropped anywhere and used.

Usage
-----
    python steg_solver.py <filepath> [--wordlist /path/to/wordlist.txt]

Author  : Sentinel CTF Framework
License : MIT
"""

from __future__ import annotations

import argparse
import os
import re
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Rich is an optional but strongly recommended dependency.
# If unavailable we fall back to plain-text output.
# ---------------------------------------------------------------------------
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.text import Text
    from rich import print as rprint

    console = Console(highlight=False)
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

    class _FallbackConsole:  # noqa: D101
        def print(self, *args, **kwargs):  # noqa: D102
            # Strip rich markup tags for plain output
            text = " ".join(str(a) for a in args)
            text = re.sub(r"\[/?[^\]]+\]", "", text)
            print(text)

        def rule(self, title="", **kwargs):  # noqa: D102
            print(f"\n{'─' * 60}  {title}")

    console = _FallbackConsole()

# ---------------------------------------------------------------------------
# Flag regex — adjust the prefix to match the CTF you are solving.
# ---------------------------------------------------------------------------
FLAG_REGEX = re.compile(
    r"(?:flag|FLAG|CTF|ctf|HTB|picoCTF|DUCTF|nahamCTF)\{[^}]{3,}\}",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# ANSI-fallback colour helpers (used only when rich is absent)
# ---------------------------------------------------------------------------
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
BOLD = "\033[1m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def section(title: str) -> None:
    """Print a prominent section divider."""
    if RICH_AVAILABLE:
        console.rule(f"[bold cyan]{title}[/bold cyan]")
    else:
        print(f"\n{BOLD}{CYAN}{'─'*60}  {title}{RESET}")


def info(msg: str) -> None:
    """Print an informational message."""
    console.print(f"[cyan]ℹ[/cyan]  {msg}" if RICH_AVAILABLE else f"[INFO] {msg}")


def success(msg: str) -> None:
    """Print a success message."""
    console.print(f"[green]✔[/green]  {msg}" if RICH_AVAILABLE else f"[OK]   {msg}")


def warn(msg: str) -> None:
    """Print a warning message."""
    console.print(f"[yellow]⚠[/yellow]  {msg}" if RICH_AVAILABLE else f"[WARN] {msg}")


def error(msg: str) -> None:
    """Print an error message."""
    console.print(f"[red]✖[/red]  {msg}" if RICH_AVAILABLE else f"[ERR]  {msg}")


def found_flag(flag: str, source: str) -> None:
    """Display a prominently styled flag discovery and exit."""
    msg = f"FLAG FOUND via {source}\n\n  {flag}"
    if RICH_AVAILABLE:
        console.print(
            Panel(
                Text(msg, style="bold green"),
                title="[bold yellow]🚩  FLAG  🚩[/bold yellow]",
                border_style="bright_green",
                padding=(1, 4),
            )
        )
    else:
        print(f"\n{BOLD}{GREEN}{'='*60}{RESET}")
        print(f"{BOLD}{GREEN}  🚩  {msg}{RESET}")
        print(f"{BOLD}{GREEN}{'='*60}{RESET}")
    sys.exit(0)


def run(cmd: list[str], timeout: int = 30, **kwargs) -> subprocess.CompletedProcess:
    """Run a subprocess command and return the completed process.

    Returns an empty-stdout CompletedProcess if the binary is not found or
    the process times out — so callers never have to handle exceptions.
    """
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            **kwargs,
        )
        return result
    except FileNotFoundError:
        warn(f"Tool not found: {cmd[0]}  — skipping step")
        return subprocess.CompletedProcess(cmd, returncode=127, stdout="", stderr="")
    except subprocess.TimeoutExpired:
        warn(f"Command timed out after {timeout}s: {' '.join(cmd)}")
        return subprocess.CompletedProcess(cmd, returncode=124, stdout="", stderr="")
    except Exception as exc:  # noqa: BLE001
        warn(f"Unexpected error running {cmd[0]}: {exc}")
        return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="")


def check_for_flag(output: str, source: str) -> None:
    """Scan *output* for flag patterns; exit immediately if one is found."""
    matches = FLAG_REGEX.findall(output)
    if matches:
        found_flag(matches[0], source)


def print_output(output: str, max_lines: int = 50) -> None:
    """Print tool output, truncating if very long."""
    lines = output.strip().splitlines()
    for line in lines[:max_lines]:
        console.print(f"    {line}")
    if len(lines) > max_lines:
        warn(f"… {len(lines) - max_lines} more lines truncated")


# ---------------------------------------------------------------------------
# Step 1 — file(1) identification
# ---------------------------------------------------------------------------


def step_file(filepath: str) -> None:
    """Run the UNIX `file` command to identify the true file type."""
    section("STEP 1 · file — type identification")
    result = run(["file", filepath])
    if result.returncode == 0:
        success(result.stdout.strip())
        check_for_flag(result.stdout, "file")
    else:
        error(result.stderr.strip() or "file command failed")


# ---------------------------------------------------------------------------
# Step 2 — strings + grep for flag pattern
# ---------------------------------------------------------------------------


def step_strings(filepath: str) -> None:
    """Extract printable strings and immediately grep for flag patterns."""
    section("STEP 2 · strings — printable string extraction")

    result = run(["strings", "-n", "7", filepath], timeout=60)
    if result.returncode == 127:
        return  # binary not found

    all_strings = result.stdout

    # First pass: look directly for flag patterns
    flags = FLAG_REGEX.findall(all_strings)
    if flags:
        found_flag(flags[0], "strings")

    # Second pass: grep for common CTF keywords
    keywords = ["flag", "password", "passwd", "secret", "key", "hidden", "decode", "base64"]
    interesting: list[str] = []
    for line in all_strings.splitlines():
        low = line.lower()
        if any(kw in low for kw in keywords):
            interesting.append(line)

    if interesting:
        info("Interesting strings found:")
        for s in interesting[:30]:
            console.print(f"    [yellow]{s}[/yellow]")
    else:
        info("No obviously interesting strings found")

    # Show all long strings (possible base64 / hex blobs)
    long_strings = [s for s in all_strings.splitlines() if len(s) > 40]
    if long_strings:
        info(f"Long strings (possible encoded data) — {len(long_strings)} found:")
        for s in long_strings[:20]:
            console.print(f"    [cyan]{s[:120]}[/cyan]")


# ---------------------------------------------------------------------------
# Step 3 — exiftool (GPS + all metadata)
# ---------------------------------------------------------------------------


def step_exiftool(filepath: str) -> None:
    """Run exiftool to extract all metadata including GPS coordinates."""
    section("STEP 3 · exiftool — metadata & GPS extraction")

    result = run(["exiftool", "-a", "-u", "-g1", filepath], timeout=30)
    if result.returncode == 127:
        return

    output = result.stdout
    check_for_flag(output, "exiftool")

    # Highlight GPS and comment fields
    gps_lines = []
    interesting_fields = ["GPS", "Comment", "Artist", "Copyright", "Description",
                          "UserComment", "XPComment", "Software", "Make", "Model"]
    for line in output.splitlines():
        if any(field.lower() in line.lower() for field in interesting_fields):
            gps_lines.append(line)

    if gps_lines:
        info("Notable metadata fields:")
        for line in gps_lines:
            console.print(f"    [yellow]{line}[/yellow]")
    else:
        info("No notable metadata fields found")

    # Print full output (truncated)
    print_output(output, max_lines=60)


# ---------------------------------------------------------------------------
# Step 4 — binwalk (embedded file detection and extraction)
# ---------------------------------------------------------------------------


def step_binwalk(filepath: str) -> None:
    """Run binwalk to find and extract embedded files."""
    section("STEP 4 · binwalk — embedded file extraction")

    # First: scan without extraction so we can see results
    result = run(["binwalk", "--magic", filepath], timeout=120)
    if result.returncode == 127:
        return

    output = result.stdout
    check_for_flag(output, "binwalk scan")
    print_output(output)

    # Count non-header lines that indicate embedded data
    data_lines = [l for l in output.splitlines() if l.strip() and not l.startswith("DECIMAL")]
    if len(data_lines) > 1:  # more than just the original file header
        info("Embedded data found — attempting extraction…")
        extract_dir = Path(filepath).parent / f"_binwalk_{Path(filepath).stem}"
        result2 = run(
            ["binwalk", "--extract", "--directory", str(extract_dir), filepath],
            timeout=120,
        )
        if result2.returncode == 0:
            success(f"Extracted to: {extract_dir}")
            # Recursively look for flags in extracted files
            for extracted in extract_dir.rglob("*"):
                if extracted.is_file():
                    try:
                        content = extracted.read_text(errors="replace")
                        check_for_flag(content, f"binwalk-extracted/{extracted.name}")
                    except Exception:
                        pass
        else:
            error(result2.stderr[:200])
    else:
        info("No additional embedded files detected by binwalk")


# ---------------------------------------------------------------------------
# Step 5 — steghide (empty passphrase, then wordlist)
# ---------------------------------------------------------------------------


def step_steghide(filepath: str, wordlist: Optional[str] = None) -> None:
    """Attempt steghide extraction with empty passphrase, then wordlist."""
    section("STEP 5 · steghide — passphrase-based extraction")

    ext = Path(filepath).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".bmp", ".wav", ".au"}:
        warn(f"steghide does not support {ext} files — skipping")
        return

    out_file = Path(filepath).with_suffix(".steghide_out.txt")

    # Try empty passphrase first
    result = run(
        ["steghide", "extract", "-sf", filepath, "-p", "", "-f", "-xf", str(out_file)],
        timeout=30,
    )
    if result.returncode == 0 or out_file.exists():
        success("steghide extracted with EMPTY passphrase!")
        try:
            data = out_file.read_text(errors="replace")
            console.print(f"    [green]{data[:500]}[/green]")
            check_for_flag(data, "steghide (empty passphrase)")
        except Exception:
            pass
        return

    # Try built-in common passphrases before the wordlist
    COMMON = [
        "password", "secret", "hidden", "steg", "steganography",
        "flag", "ctf", "admin", "1234", "0000", "letmein",
    ]

    info("Trying common passphrases…")
    for phrase in COMMON:
        r = run(
            ["steghide", "extract", "-sf", filepath, "-p", phrase, "-f", "-xf", str(out_file)],
            timeout=10,
        )
        if r.returncode == 0 or out_file.exists():
            success(f"steghide extracted with passphrase: [bold]{phrase}[/bold]")
            try:
                data = out_file.read_text(errors="replace")
                console.print(f"    [green]{data[:500]}[/green]")
                check_for_flag(data, f"steghide (passphrase={phrase!r})")
            except Exception:
                pass
            return

    if wordlist and Path(wordlist).is_file():
        info(f"Running wordlist attack with: {wordlist}")
        try:
            with open(wordlist, "r", errors="replace") as wf:
                for i, line in enumerate(wf):
                    phrase = line.strip()
                    if not phrase:
                        continue
                    r = run(
                        ["steghide", "extract", "-sf", filepath, "-p", phrase,
                         "-f", "-xf", str(out_file)],
                        timeout=5,
                    )
                    if r.returncode == 0 or out_file.exists():
                        success(f"steghide cracked! Passphrase: [bold]{phrase}[/bold]")
                        try:
                            data = out_file.read_text(errors="replace")
                            console.print(f"    [green]{data[:500]}[/green]")
                            check_for_flag(data, f"steghide (wordlist: {phrase!r})")
                        except Exception:
                            pass
                        return
                    if i % 1000 == 0 and i > 0:
                        info(f"  … tried {i} passphrases …")
        except Exception as exc:
            error(f"Wordlist read error: {exc}")
    else:
        if wordlist:
            warn(f"Wordlist not found: {wordlist}")
        info("No wordlist provided. Use --wordlist to run a full passphrase attack.")

    warn("steghide: no data extracted")


# ---------------------------------------------------------------------------
# Step 6 — zsteg (PNG LSB and other channels)
# ---------------------------------------------------------------------------


def step_zsteg(filepath: str) -> None:
    """Run zsteg for PNG/BMP LSB analysis."""
    section("STEP 6 · zsteg — PNG/BMP LSB analysis")

    ext = Path(filepath).suffix.lower()
    if ext not in {".png", ".bmp"}:
        warn(f"zsteg only supports PNG/BMP — skipping for {ext}")
        return

    # zsteg -a = all channels
    result = run(["zsteg", "-a", filepath], timeout=120)
    if result.returncode == 127:
        warn("zsteg not found. Install with: gem install zsteg")
        return

    output = result.stdout
    check_for_flag(output, "zsteg")

    # Highlight non-empty findings
    for line in output.splitlines():
        if "imagedata" not in line.lower() and line.strip():
            console.print(f"    [cyan]{line}[/cyan]")


# ---------------------------------------------------------------------------
# Step 7 — Pure-Python LSB extraction (PIL)
# ---------------------------------------------------------------------------


def step_lsb_python(filepath: str) -> None:
    """Extract LSB data from image using pure Python + Pillow."""
    section("STEP 7 · LSB extraction — pure Python (Pillow)")

    ext = Path(filepath).suffix.lower()
    if ext not in {".png", ".bmp", ".jpg", ".jpeg", ".tiff", ".gif"}:
        warn(f"LSB extraction: skipping non-image format {ext}")
        return

    try:
        from PIL import Image
    except ImportError:
        warn("Pillow not installed. Install with: pip install Pillow")
        return

    try:
        img = Image.open(filepath).convert("RGB")
    except Exception as exc:
        error(f"Cannot open image: {exc}")
        return

    pixels = list(img.getdata())
    width, height = img.size
    info(f"Image size: {width}×{height}, pixels: {len(pixels)}")

    for channel_combo, indices in [
        ("R", [0]),
        ("G", [1]),
        ("B", [2]),
        ("RGB", [0, 1, 2]),
    ]:
        bits: list[int] = []
        for px in pixels:
            for i in indices:
                bits.append(px[i] & 1)

        # Pack bits into bytes
        byte_data = bytearray()
        for i in range(0, len(bits) - 7, 8):
            byte_val = 0
            for b in range(8):
                byte_val = (byte_val << 1) | bits[i + b]
            byte_data.append(byte_val)

        # Try to decode as UTF-8 text
        try:
            text = byte_data[:512].decode("utf-8", errors="strict")
            printable = "".join(c for c in text if c.isprintable())
            if len(printable) > 10:
                info(f"LSB-{channel_combo}: [cyan]{printable[:200]}[/cyan]")
                check_for_flag(printable, f"LSB-{channel_combo}")
        except UnicodeDecodeError:
            pass  # Not valid UTF-8

        # Also scan raw bytes for flag pattern
        try:
            raw_text = byte_data.decode("latin-1")
            check_for_flag(raw_text, f"LSB-{channel_combo} raw")
        except Exception:
            pass

    info("LSB extraction complete (no flag found in standard channels)")


# ---------------------------------------------------------------------------
# Step 8 — Appended data after EOF marker
# ---------------------------------------------------------------------------

# Known EOF / end-of-file markers for common formats
EOF_MARKERS: dict[str, bytes] = {
    ".png": bytes.fromhex("49454e44ae426082"),   # IEND chunk + CRC
    ".jpg": bytes.fromhex("ffd9"),
    ".jpeg": bytes.fromhex("ffd9"),
    ".gif": b";\x00" if False else b";",          # GIF trailer
    ".zip": bytes.fromhex("504b0506"),             # End of central directory
    ".pdf": b"%%EOF",
}


def step_appended_data(filepath: str) -> None:
    """Check for data appended after the file's natural EOF marker."""
    section("STEP 8 · Appended data — EOF marker check")

    ext = Path(filepath).suffix.lower()
    marker = EOF_MARKERS.get(ext)

    if marker is None:
        warn(f"No known EOF marker for {ext} — skipping appended data check")
        return

    try:
        raw = Path(filepath).read_bytes()
    except Exception as exc:
        error(f"Cannot read file: {exc}")
        return

    # Find the LAST occurrence of the EOF marker
    idx = raw.rfind(marker)
    if idx == -1:
        warn(f"EOF marker ({marker.hex()}) not found in file — possibly corrupt?")
        return

    end_of_marker = idx + len(marker)
    if end_of_marker < len(raw):
        appended = raw[end_of_marker:]
        success(f"Found {len(appended)} bytes appended after EOF marker!")

        # Try text decode
        try:
            text = appended.decode("utf-8", errors="replace")
            console.print(f"    [green]{text[:500]}[/green]")
            check_for_flag(text, "appended data")
        except Exception:
            pass

        # Show hex dump of first 256 bytes
        info("Hex dump of appended data (first 256 bytes):")
        for i in range(0, min(256, len(appended)), 16):
            chunk = appended[i : i + 16]
            hex_part = " ".join(f"{b:02x}" for b in chunk)
            ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            console.print(f"    {i:04x}  {hex_part:<48}  |{ascii_part}|")
    else:
        success("No data appended after EOF marker — file appears clean")


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Sentinel CTF — Steganography Solver",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("filepath", help="Path to the file to analyse")
    parser.add_argument(
        "--wordlist",
        metavar="FILE",
        default=None,
        help="Path to passphrase wordlist for steghide brute-force",
    )
    parser.add_argument(
        "--skip",
        metavar="STEP",
        nargs="+",
        default=[],
        choices=["file", "strings", "exiftool", "binwalk", "steghide", "zsteg", "lsb", "appended"],
        help="Skip specific analysis steps",
    )
    return parser.parse_args()


def main() -> None:
    """Entry point — run all steganography analysis steps in order."""
    args = parse_args()
    filepath = args.filepath

    if not Path(filepath).is_file():
        error(f"File not found: {filepath}")
        sys.exit(1)

    file_size = Path(filepath).stat().st_size
    if RICH_AVAILABLE:
        console.print(
            Panel(
                f"[bold]File:[/bold] {filepath}\n"
                f"[bold]Size:[/bold] {file_size:,} bytes",
                title="[bold yellow]Sentinel CTF · Steg Solver[/bold yellow]",
                border_style="bright_cyan",
            )
        )
    else:
        print(f"\n{'='*60}")
        print(f"  Sentinel CTF · Steg Solver")
        print(f"  File : {filepath}")
        print(f"  Size : {file_size:,} bytes")
        print(f"{'='*60}")

    skip = set(args.skip)

    if "file" not in skip:
        step_file(filepath)

    if "strings" not in skip:
        step_strings(filepath)

    if "exiftool" not in skip:
        step_exiftool(filepath)

    if "binwalk" not in skip:
        step_binwalk(filepath)

    if "steghide" not in skip:
        step_steghide(filepath, wordlist=args.wordlist)

    if "zsteg" not in skip:
        step_zsteg(filepath)

    if "lsb" not in skip:
        step_lsb_python(filepath)

    if "appended" not in skip:
        step_appended_data(filepath)

    # Final summary
    section("COMPLETE")
    warn("No flag was automatically found. Manual analysis may be required.")
    info("Suggestions:")
    console.print("    • Try stegsolve.jar for visual layer analysis")
    console.print("    • Try stegoveritas: pip install stegoveritas")
    console.print("    • Check file with hexedit / xxd for hidden patterns")
    console.print("    • Try openstego or outguess for alternative steg tools")
    console.print("    • Check audio files with Audacity (spectrogram view)")


if __name__ == "__main__":
    main()
