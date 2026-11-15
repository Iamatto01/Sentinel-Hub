#!/usr/bin/env python3
"""
Sentinel CTF Framework — Forensics Template
============================================
memory_solver.py  ·  Volatility 3 Memory Forensics Script

Standalone memory image analyser built on Volatility 3. Runs all
standard plugins for the detected OS, searches every output for
flag patterns, and produces a consolidated findings report.

Usage
-----
    python memory_solver.py <memory.img> [--profile win/linux/mac]
    python memory_solver.py memdump.raw --timeout 120

Author  : Sentinel CTF Framework
License : MIT
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

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

# ---------------------------------------------------------------------------
# Suspicious process names for malware investigation
# ---------------------------------------------------------------------------
SUSPICIOUS_PROCESSES = {
    "cmd.exe", "powershell.exe", "wscript.exe", "cscript.exe",
    "mshta.exe", "regsvr32.exe", "rundll32.exe", "svchost.exe",
    "lsass.exe", "nc.exe", "ncat.exe", "python.exe", "python3",
    "bash", "sh", "netcat",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def section(title: str) -> None:
    if RICH:
        console.rule(f"[bold cyan]{title}[/bold cyan]")
    else:
        print(f"\n{'─'*60}  {title}")


def info(msg: str) -> None:
    console.print(f"[cyan]ℹ[/cyan]  {msg}" if RICH else f"[INFO] {msg}")


def success(msg: str) -> None:
    console.print(f"[green]✔[/green]  {msg}" if RICH else f"[OK]   {msg}")


def warn(msg: str) -> None:
    console.print(f"[yellow]⚠[/yellow]  {msg}" if RICH else f"[WARN] {msg}")


def error(msg: str) -> None:
    console.print(f"[red]✖[/red]  {msg}" if RICH else f"[ERR]  {msg}")


def found_flag(flag: str, source: str) -> None:
    """Print flag and record it (do NOT exit — continue collecting findings)."""
    msg = f"FLAG FOUND via {source}: {flag}"
    if RICH:
        console.print(
            Panel(
                Text(f"  {flag}", style="bold green"),
                title=f"[bold yellow]🚩  FLAG — {source}[/bold yellow]",
                border_style="bright_green",
            )
        )
    else:
        print(f"\n{'='*60}\n  🚩  {msg}\n{'='*60}")


def check_flag(text: str, source: str, findings: list[str]) -> None:
    """Scan text for flags; record all matches but do not exit."""
    for m in FLAG_REGEX.finditer(text):
        flag = m.group(0)
        if flag not in findings:
            findings.append(flag)
            found_flag(flag, source)


def run_vol(
    vol_cmd: list[str],
    image: str,
    plugin: str,
    extra_args: list[str] | None = None,
    timeout: int = 120,
) -> str:
    """Run a Volatility 3 plugin and return stdout as a string."""
    cmd = vol_cmd + ["-f", image, plugin] + (extra_args or [])
    info(f"Running: {' '.join(cmd[:8])}")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0 and r.stderr:
            warn(f"vol stderr: {r.stderr[:200]}")
        return r.stdout
    except FileNotFoundError:
        error(f"Volatility not found: {vol_cmd[0]}")
        return ""
    except subprocess.TimeoutExpired:
        warn(f"Plugin {plugin} timed out after {timeout}s")
        return ""
    except Exception as exc:  # noqa: BLE001
        warn(f"vol error: {exc}")
        return ""


# ---------------------------------------------------------------------------
# OS Auto-detection
# ---------------------------------------------------------------------------


def detect_os(image: str, vol_cmd: list[str], timeout: int) -> str:
    """Auto-detect the OS of the memory image.

    Returns 'windows', 'linux', or 'unknown'.
    """
    section("OS Detection")
    info("Attempting Windows info plugin…")
    out = run_vol(vol_cmd, image, "windows.info", timeout=timeout)
    if out and "Layer" in out:
        success("Detected: Windows")
        for line in out.splitlines()[:15]:
            console.print(f"    {line}")
        return "windows"

    info("Attempting Linux banner detection…")
    out2 = run_vol(vol_cmd, image, "banners.Banners", timeout=timeout)
    if out2 and "Linux" in out2:
        success("Detected: Linux")
        for line in out2.splitlines()[:10]:
            console.print(f"    {line}")
        return "linux"

    info("Attempting mac.info…")
    out3 = run_vol(vol_cmd, image, "mac.info", timeout=timeout)
    if out3 and "Layer" in out3:
        success("Detected: macOS")
        return "mac"

    warn("OS could not be auto-detected. Defaulting to Windows plugins.")
    return "windows"


# ---------------------------------------------------------------------------
# Windows analysis
# ---------------------------------------------------------------------------


def analyse_windows(
    image: str,
    vol_cmd: list[str],
    timeout: int,
    findings: list[str],
    output_dir: str,
) -> None:
    """Run the full Windows Volatility plugin suite."""

    # ── pslist ────────────────────────────────────────────────────────────
    section("WIN · pslist — Process List")
    out = run_vol(vol_cmd, image, "windows.pslist", timeout=timeout)
    check_flag(out, "pslist", findings)
    if RICH:
        # Pretty-print first 40 lines
        for line in out.splitlines()[:40]:
            # Highlight suspicious processes
            llow = line.lower()
            style = "yellow" if any(s in llow for s in SUSPICIOUS_PROCESSES) else "white"
            console.print(f"    [{style}]{line}[/{style}]")
    else:
        for line in out.splitlines()[:40]:
            print(f"    {line}")

    # Collect PIDs of suspicious processes for later dumpfiles
    suspicious_pids: list[str] = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            proc_name = parts[1].lower() if len(parts) > 1 else ""
            pid = parts[2] if len(parts) > 2 else ""
            if any(s in proc_name for s in SUSPICIOUS_PROCESSES):
                suspicious_pids.append(pid)
                warn(f"Suspicious process: {line.strip()}")

    # ── cmdline ───────────────────────────────────────────────────────────
    section("WIN · cmdline — Command-Line Arguments")
    out = run_vol(vol_cmd, image, "windows.cmdline", timeout=timeout)
    check_flag(out, "cmdline", findings)
    for line in out.splitlines()[:60]:
        console.print(f"    {line}" if not RICH else f"    [dim]{line}[/dim]")

    # ── filescan (grep for flag-like filenames) ───────────────────────────
    section("WIN · filescan — File System Scan")
    info("Running filescan (this may take several minutes)…")
    out = run_vol(vol_cmd, image, "windows.filescan", timeout=max(timeout, 300))
    check_flag(out, "filescan", findings)
    # Look for suspicious/interesting filenames
    interesting_ext = {".txt", ".py", ".sh", ".flag", ".key", ".zip",
                       ".7z", ".docx", ".xlsx", ".pdf", ".kdbx"}
    interesting_lines = []
    for line in out.splitlines():
        low = line.lower()
        if any(ext in low for ext in interesting_ext) or "flag" in low or "secret" in low:
            interesting_lines.append(line)
    if interesting_lines:
        success(f"Interesting file entries ({len(interesting_lines)} found):")
        for line in interesting_lines[:30]:
            console.print(f"    [yellow]{line}[/yellow]")

    # ── dumpfiles for suspicious processes ───────────────────────────────
    if suspicious_pids:
        section("WIN · dumpfiles — Dump Suspicious Process Files")
        dump_dir = Path(output_dir) / "dumpfiles"
        dump_dir.mkdir(parents=True, exist_ok=True)
        for pid in suspicious_pids[:5]:  # limit to first 5 to avoid excessive runtime
            info(f"Dumping files for PID {pid}…")
            out = run_vol(
                vol_cmd, image, "windows.dumpfiles",
                extra_args=["--pid", pid, "--dump-dir", str(dump_dir)],
                timeout=timeout,
            )
            check_flag(out, f"dumpfiles PID={pid}", findings)
            # Scan dumped files
            for dumped_file in dump_dir.iterdir():
                try:
                    text = dumped_file.read_text(errors="replace")
                    check_flag(text, f"dumped-file:{dumped_file.name}", findings)
                except Exception:
                    pass

    # ── netscan ───────────────────────────────────────────────────────────
    section("WIN · netscan — Network Connections")
    out = run_vol(vol_cmd, image, "windows.netscan", timeout=timeout)
    check_flag(out, "netscan", findings)
    for line in out.splitlines()[:40]:
        console.print(f"    {line}")

    # ── malfind ───────────────────────────────────────────────────────────
    section("WIN · malfind — Injected Code Detection")
    out = run_vol(vol_cmd, image, "windows.malfind", timeout=timeout)
    check_flag(out, "malfind", findings)
    lines = out.splitlines()
    if lines:
        success(f"malfind output ({len(lines)} lines):")
        for line in lines[:40]:
            console.print(f"    [magenta]{line}[/magenta]")
    else:
        info("No injected code detected by malfind")

    # ── hashdump ──────────────────────────────────────────────────────────
    section("WIN · hashdump — Credential Hash Extraction")
    out = run_vol(vol_cmd, image, "windows.hashdump", timeout=timeout)
    check_flag(out, "hashdump", findings)
    if out.strip():
        success("Hashes found:")
        for line in out.splitlines()[:20]:
            console.print(f"    [red]{line}[/red]")
    else:
        info("No hashes found (may require SYSTEM/SAM to be present in memory)")

    # ── registry hives ────────────────────────────────────────────────────
    section("WIN · registry.hivelist — Loaded Hives")
    out = run_vol(vol_cmd, image, "windows.registry.hivelist", timeout=timeout)
    check_flag(out, "hivelist", findings)
    for line in out.splitlines()[:20]:
        console.print(f"    {line}")

    # ── strings scan of raw image ─────────────────────────────────────────
    section("WIN · strings — Raw Image String Search")
    info("Running strings on raw memory image (this may take a while)…")
    try:
        r = subprocess.run(
            ["strings", "-n", "8", image],
            capture_output=True,
            text=True,
            timeout=180,
        )
        out = r.stdout
        check_flag(out, "strings (raw image)", findings)
        # Also look for base64-encoded flags
        b64_candidates = re.findall(r"[A-Za-z0-9+/]{40,}={0,2}", out)
        if b64_candidates:
            info(f"Found {len(b64_candidates)} potential base64 blobs in image strings")
            import base64
            for blob in b64_candidates[:20]:
                try:
                    decoded = base64.b64decode(blob).decode("utf-8", errors="replace")
                    check_flag(decoded, f"strings b64:{blob[:30]}", findings)
                except Exception:
                    pass
    except Exception as exc:
        warn(f"strings on raw image failed: {exc}")


# ---------------------------------------------------------------------------
# Linux analysis
# ---------------------------------------------------------------------------


def analyse_linux(
    image: str,
    vol_cmd: list[str],
    timeout: int,
    findings: list[str],
) -> None:
    """Run the Linux Volatility plugin suite."""

    section("LINUX · linux.pslist — Process List")
    out = run_vol(vol_cmd, image, "linux.pslist", timeout=timeout)
    check_flag(out, "linux.pslist", findings)
    for line in out.splitlines()[:40]:
        console.print(f"    {line}")

    section("LINUX · linux.bash — Bash History")
    out = run_vol(vol_cmd, image, "linux.bash", timeout=timeout)
    check_flag(out, "linux.bash", findings)
    if out.strip():
        success("Bash history recovered:")
        for line in out.splitlines()[:50]:
            console.print(f"    [yellow]{line}[/yellow]")
    else:
        info("No bash history found")

    section("LINUX · linux.netstat — Network Connections")
    out = run_vol(vol_cmd, image, "linux.netstat", timeout=timeout)
    check_flag(out, "linux.netstat", findings)
    for line in out.splitlines()[:40]:
        console.print(f"    {line}")

    section("LINUX · linux.lsof — Open Files")
    out = run_vol(vol_cmd, image, "linux.lsof", timeout=timeout)
    check_flag(out, "linux.lsof", findings)
    for line in out.splitlines()[:40]:
        console.print(f"    {line}")

    section("LINUX · linux.malfind — Injected Code")
    out = run_vol(vol_cmd, image, "linux.malfind", timeout=timeout)
    check_flag(out, "linux.malfind", findings)
    for line in out.splitlines()[:30]:
        console.print(f"    [magenta]{line}[/magenta]")

    section("LINUX · linux.strings — String Search")
    try:
        r = subprocess.run(
            ["strings", "-n", "8", image],
            capture_output=True,
            text=True,
            timeout=180,
        )
        check_flag(r.stdout, "linux strings (raw image)", findings)
    except Exception as exc:
        warn(f"strings failed: {exc}")


# ---------------------------------------------------------------------------
# Findings report
# ---------------------------------------------------------------------------


def print_report(findings: list[str]) -> None:
    """Print a consolidated findings report."""
    section("FINAL REPORT")
    if not findings:
        warn("No flags were automatically found.")
        info("Suggestions:")
        console.print("    • Try strings on the raw image manually")
        console.print("    • Use vol3 windows.dumpfiles --physaddr to dump specific files")
        console.print("    • Check windows.envars for environment variable leaks")
        console.print("    • Run windows.clipboard for clipboard data")
        console.print("    • Try windows.handles for interesting handle names")
    else:
        if RICH:
            console.print(
                Panel(
                    "\n".join(f"  🚩  [bold green]{f}[/bold green]" for f in findings),
                    title="[bold yellow]FLAGS FOUND[/bold yellow]",
                    border_style="bright_green",
                )
            )
        else:
            print("\n" + "="*60)
            print("  FLAGS FOUND:")
            for f in findings:
                print(f"    🚩  {f}")
            print("="*60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def find_volatility() -> list[str]:
    """Locate the Volatility 3 binary. Return command list."""
    for candidate in ["vol", "vol3", "volatility3", "python -m volatility3"]:
        parts = candidate.split()
        try:
            r = subprocess.run(
                parts + ["--help"], capture_output=True, text=True, timeout=5
            )
            if r.returncode in (0, 2):  # 2 = usage error (still means vol is there)
                return parts
        except FileNotFoundError:
            continue
    return ["vol3"]  # default fallback


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    p = argparse.ArgumentParser(
        description="Sentinel CTF — Memory Forensics Solver (Volatility 3)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("image", help="Path to the memory image file")
    p.add_argument(
        "--profile",
        choices=["windows", "linux", "mac", "auto"],
        default="auto",
        help="Force OS profile (default: auto-detect)",
    )
    p.add_argument(
        "--timeout", type=int, default=120,
        help="Per-plugin timeout in seconds (default: 120)",
    )
    p.add_argument(
        "--output", default=None, metavar="DIR",
        help="Output directory for dumped files",
    )
    p.add_argument(
        "--vol", default=None, metavar="CMD",
        help="Volatility 3 command (default: auto-detect)",
    )
    return p.parse_args()


def main() -> None:
    """Entry point."""
    args = parse_args()
    image = args.image

    if not Path(image).is_file():
        error(f"Memory image not found: {image}")
        sys.exit(1)

    output_dir = args.output or str(Path(image).parent / f"{Path(image).stem}_vol3_output")
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    vol_cmd = args.vol.split() if args.vol else find_volatility()

    if RICH:
        console.print(
            Panel(
                f"[bold]Image:[/bold]  {image}\n"
                f"[bold]Size:[/bold]   {Path(image).stat().st_size:,} bytes\n"
                f"[bold]Vol3:[/bold]   {' '.join(vol_cmd)}\n"
                f"[bold]Output:[/bold] {output_dir}",
                title="[bold yellow]Sentinel CTF · Memory Solver[/bold yellow]",
                border_style="bright_cyan",
            )
        )

    findings: list[str] = []

    # Detect or force OS profile
    if args.profile == "auto":
        detected_os = detect_os(image, vol_cmd, args.timeout)
    else:
        detected_os = args.profile
        info(f"Using forced profile: {detected_os}")

    if detected_os == "windows":
        analyse_windows(image, vol_cmd, args.timeout, findings, output_dir)
    elif detected_os == "linux":
        analyse_linux(image, vol_cmd, args.timeout, findings)
    else:
        warn(f"No specific analysis path for: {detected_os}")
        warn("Falling back to Windows plugins…")
        analyse_windows(image, vol_cmd, args.timeout, findings, output_dir)

    print_report(findings)


if __name__ == "__main__":
    main()
