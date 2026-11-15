#!/usr/bin/env python3
"""
Sentinel CTF Framework — Reversing Template
============================================
crackme_solver.py  ·  Crackme / Binary Reverse Engineering Solver

Multi-phase automated crackme solver:
  Phase 1 — file + checksec + strings
  Phase 2 — ltrace (strcmp / memcmp argument extraction)
  Phase 3 — strace (syscall snooping: open, connect)
  Phase 4 — GDB automated strcmp hook
  Phase 5 — Brute-force input with ltrace-discovered candidates

Usage
-----
    python crackme_solver.py ./crackme [--input "test"]
    python crackme_solver.py ./crackme --gdb-path /usr/bin/gdb

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
# Flag / password regexes
# ---------------------------------------------------------------------------
FLAG_REGEX = re.compile(
    r"(?:flag|FLAG|CTF|ctf|HTB|picoCTF|DUCTF|nahamCTF)\{[^}]{3,}\}",
    re.IGNORECASE,
)
# Heuristic: looks like a password / key (alphanum + special, 8-64 chars)
PASSWORD_REGEX = re.compile(r"[A-Za-z0-9@#$!_\-]{8,64}")

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
    """Print flag prominently and exit."""
    if RICH:
        console.print(
            Panel(
                Text(f"  {flag}", style="bold green"),
                title=f"[bold yellow]🚩  FLAG — {source}[/bold yellow]",
                border_style="bright_green",
                padding=(1, 4),
            )
        )
    else:
        print(f"\n{'='*60}\n  🚩  FLAG ({source}): {flag}\n{'='*60}")
    sys.exit(0)


def highlight(text: str, source: str) -> None:
    """Highlight interesting (non-flag) findings."""
    if RICH:
        console.print(f"  [bold yellow]★[/bold yellow] [yellow]{text}[/yellow]  ([dim]{source}[/dim])")
    else:
        print(f"  ★  {text}  ({source})")


def check_flag(text: str, source: str) -> None:
    """Exit immediately if a flag is found."""
    m = FLAG_REGEX.search(text)
    if m:
        found_flag(m.group(0), source)


def run(cmd: list[str], input_data: Optional[str] = None, timeout: int = 10, **kw) -> subprocess.CompletedProcess:
    """Run subprocess, return result. Never raises."""
    try:
        return subprocess.run(
            cmd,
            input=input_data,
            capture_output=True,
            text=True,
            timeout=timeout,
            **kw,
        )
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 127, "", f"{cmd[0]}: not found")
    except subprocess.TimeoutExpired:
        warn(f"Timed out ({timeout}s): {' '.join(cmd[:4])}")
        return subprocess.CompletedProcess(cmd, 124, "", "timeout")
    except Exception as exc:  # noqa: BLE001
        return subprocess.CompletedProcess(cmd, 1, "", str(exc))


# ---------------------------------------------------------------------------
# Phase 1 — file, checksec, strings
# ---------------------------------------------------------------------------


def phase1_static(binary: str, test_input: str) -> list[str]:
    """Static analysis: file type, security properties, embedded strings."""
    section("PHASE 1 · Static Analysis — file / checksec / strings")
    candidates: list[str] = []

    # ── file(1) ──────────────────────────────────────────────────────────
    r = run(["file", binary])
    if r.returncode == 0:
        success(f"file: {r.stdout.strip()}")
        check_flag(r.stdout, "file")
    else:
        warn(f"file: {r.stderr[:100]}")

    # ── checksec ─────────────────────────────────────────────────────────
    info("Running checksec…")
    for checksec_cmd in [["checksec", "--file", binary], ["checksec", "--file=" + binary]]:
        r = run(checksec_cmd)
        if r.returncode == 0:
            output = r.stdout + r.stderr
            info("checksec results:")
            for line in output.splitlines()[:10]:
                console.print(f"    {line}")
            break
    else:
        # Fall back to pwntools checksec
        try:
            import subprocess as sp
            r2 = sp.run(
                ["python3", "-c",
                 f"from pwn import *; e=ELF('{binary}', checksec=False); e.checksec()"],
                capture_output=True, text=True, timeout=10,
            )
            if r2.returncode == 0:
                console.print(r2.stdout[:500])
        except Exception:
            warn("checksec not found. Install: pip install pwntools or apt install checksec")

    # ── strings ──────────────────────────────────────────────────────────
    info("Extracting strings…")
    r = run(["strings", "-n", "6", binary], timeout=30)
    if r.returncode == 127:
        warn("strings not found")
        return candidates

    all_strings = r.stdout
    check_flag(all_strings, "strings")

    # Collect password-like candidates
    for line in all_strings.splitlines():
        stripped = line.strip()
        if 6 <= len(stripped) <= 64:
            candidates.append(stripped)
        if FLAG_REGEX.search(stripped):
            found_flag(stripped, "strings")

    # Highlight interesting strings
    keywords = ["correct", "wrong", "password", "passwd", "key", "secret",
                 "flag", "congratulation", "access", "denied", "try again"]
    interesting = [s for s in all_strings.splitlines()
                   if any(kw in s.lower() for kw in keywords)]
    if interesting:
        info("Interesting strings:")
        for s in interesting[:20]:
            console.print(f"    [yellow]{s}[/yellow]")

    info(f"Collected {len(candidates)} string candidates for brute-force")
    return candidates


# ---------------------------------------------------------------------------
# Phase 2 — ltrace (strcmp / memcmp extraction)
# ---------------------------------------------------------------------------


def phase2_ltrace(binary: str, test_input: str) -> list[str]:
    """Run ltrace and extract comparison function arguments."""
    section("PHASE 2 · ltrace — Library Call Tracing")
    candidates: list[str] = []

    r = run(
        ["ltrace", "-s", "256", "-e", "strcmp+memcmp+strncmp+strcasecmp+bcmp", binary],
        input_data=test_input + "\n",
        timeout=15,
    )
    if r.returncode == 127:
        warn("ltrace not found. Install: apt install ltrace")
        return candidates

    output = r.stderr + r.stdout  # ltrace writes to stderr by default
    check_flag(output, "ltrace")

    # Parse strcmp("input", "expected") → extract expected value
    patterns = [
        # strcmp("actual", "expected")  or  strcmp("expected", "actual")
        re.compile(r'(?:strcmp|strncmp|strcasecmp|bcmp)\("([^"]{1,128})",\s*"([^"]{1,128})"'),
        # memcmp(addr, "expected", n)
        re.compile(r'memcmp\([^,]+,\s*"([^"]{1,128})"'),
    ]

    for line in output.splitlines():
        console.print(f"    [dim]{line}[/dim]")
        for pat in patterns:
            for m in pat.finditer(line):
                for grp in m.groups():
                    if grp and grp not in candidates:
                        candidates.append(grp)
                        highlight(grp, "ltrace strcmp/memcmp")
                        check_flag(grp, f"ltrace: {line[:60]}")

    if not candidates:
        info("No comparison calls intercepted (binary may be statically linked)")
        info("Tip: for static binaries, use GDB or Frida for dynamic instrumentation")

    return candidates


# ---------------------------------------------------------------------------
# Phase 3 — strace (syscall tracing)
# ---------------------------------------------------------------------------


def phase3_strace(binary: str, test_input: str) -> None:
    """Run strace looking for file opens and network connections."""
    section("PHASE 3 · strace — System Call Tracing")

    r = run(
        ["strace", "-e", "trace=open,openat,read,write,connect,execve",
         "-s", "256", binary],
        input_data=test_input + "\n",
        timeout=15,
    )
    if r.returncode == 127:
        warn("strace not found. Install: apt install strace")
        return

    output = r.stderr + r.stdout
    check_flag(output, "strace")

    # Look for interesting opens and network connections
    interesting: list[str] = []
    for line in output.splitlines():
        if any(kw in line for kw in ["open", "connect", "execve", "read", "write"]):
            # Filter out noise (lib, proc, etc.)
            if not any(skip in line for skip in ["/lib", "/proc", "/dev", "= -1"]):
                interesting.append(line)

    if interesting:
        info("Interesting syscalls:")
        for line in interesting[:30]:
            console.print(f"    [yellow]{line}[/yellow]")
            check_flag(line, f"strace: {line[:40]}")
    else:
        info("No suspicious syscalls detected")


# ---------------------------------------------------------------------------
# Phase 4 — GDB automated strcmp hook
# ---------------------------------------------------------------------------

GDB_SCRIPT_TEMPLATE = """\
# Sentinel CTF — GDB strcmp hook
# Breaks on common comparison functions and prints both arguments.

set pagination off
set disassembly-flavor intel

# Try to break at strcmp, memcmp, strncmp, strcasecmp
b strcmp
b memcmp
b strncmp
b strcasecmp

# Also try to break at custom "check" or "validate" functions
# (uncomment and rename as needed)
# b check_password
# b validate_key

commands 1
  silent
  printf "\\n[GDB] strcmp called:\\n"
  printf "  arg1 = %%s\\n", (char*)$rdi
  printf "  arg2 = %%s\\n", (char*)$rsi
  continue
end

commands 2
  silent
  printf "\\n[GDB] memcmp called (first 32 bytes):\\n"
  x/32bx $rdi
  x/32bx $rsi
  continue
end

commands 3
  silent
  printf "\\n[GDB] strncmp called:\\n"
  printf "  arg1 = %%s\\n", (char*)$rdi
  printf "  arg2 = %%s\\n", (char*)$rsi
  continue
end

commands 4
  silent
  printf "\\n[GDB] strcasecmp called:\\n"
  printf "  arg1 = %%s\\n", (char*)$rdi
  printf "  arg2 = %%s\\n", (char*)$rsi
  continue
end

run <<< "{input}"
quit
"""


def phase4_gdb(binary: str, test_input: str, gdb_path: str) -> list[str]:
    """Write a GDB script to /tmp and run it once; extract comparison args."""
    section("PHASE 4 · GDB — Automated strcmp Hook")
    candidates: list[str] = []

    gdb_script = GDB_SCRIPT_TEMPLATE.format(input=test_input.replace('"', '\\"'))
    script_path = Path(tempfile.gettempdir()) / "sentinel_gdb_hook.gdb"
    script_path.write_text(gdb_script)
    info(f"GDB script written to: {script_path}")

    r = run(
        [gdb_path, "-batch", "-x", str(script_path), "--args", binary],
        timeout=30,
    )
    if r.returncode == 127:
        warn(f"GDB not found at: {gdb_path}")
        info("Install: apt install gdb  or  brew install gdb")
        return candidates

    output = r.stdout + r.stderr
    check_flag(output, "GDB")

    # Extract args printed by our commands
    arg_re = re.compile(r"arg\d = (.+)")
    for line in output.splitlines():
        console.print(f"    [dim]{line}[/dim]")
        m = arg_re.search(line)
        if m:
            val = m.group(1).strip()
            if val and val not in candidates:
                candidates.append(val)
                highlight(val, "GDB strcmp arg")
                check_flag(val, "GDB strcmp arg")

    return candidates


# ---------------------------------------------------------------------------
# Phase 5 — Brute-force with all discovered candidates
# ---------------------------------------------------------------------------


def phase5_brute(binary: str, candidates: list[str]) -> None:
    """Try running the binary with each discovered candidate as input."""
    section(f"PHASE 5 · Brute-Force Input ({len(candidates)} candidates)")

    if not candidates:
        info("No candidates to try. Consider building a wordlist manually.")
        return

    # De-duplicate, preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    info(f"Trying {len(unique)} unique inputs…")
    for candidate in unique:
        r = run([binary], input_data=candidate + "\n", timeout=5)
        combined = r.stdout + r.stderr

        # Check for flag in output
        check_flag(combined, f"brute-force input={candidate!r}")

        # Check for success keywords in output
        success_kw = ["correct", "congratulation", "well done", "you win",
                      "access granted", "flag", "yes", "success"]
        if any(kw in combined.lower() for kw in success_kw):
            success(f"SUCCESS keyword found with input: [bold]{candidate}[/bold]")
            console.print(f"    Output: {combined[:300]}")
            check_flag(combined, f"brute candidate={candidate!r}")

        info(f"  Tried: {candidate!r:40s} → {combined.strip()[:60]}")

    warn("All candidates exhausted. No flag found in Phase 5.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Sentinel CTF — Crackme / Binary Solver",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("binary", help="Path to the binary to analyse")
    p.add_argument(
        "--input", default="test_input_1234",
        help="Initial test input for dynamic analysis (default: 'test_input_1234')",
    )
    p.add_argument(
        "--gdb-path", default="gdb", metavar="PATH",
        help="Path to GDB binary (default: gdb)",
    )
    p.add_argument(
        "--skip", nargs="+", default=[],
        choices=["static", "ltrace", "strace", "gdb", "brute"],
        help="Skip specific phases",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    binary = args.binary

    if not Path(binary).is_file():
        error(f"Binary not found: {binary}")
        sys.exit(1)

    # Ensure the binary is executable
    if not os.access(binary, os.X_OK):
        warn(f"Binary is not executable. Running: chmod +x {binary}")
        os.chmod(binary, 0o755)

    if RICH:
        console.print(
            Panel(
                f"[bold]Binary:[/bold] {binary}\n"
                f"[bold]Size:[/bold]   {Path(binary).stat().st_size:,} bytes\n"
                f"[bold]Input:[/bold]  {args.input!r}",
                title="[bold yellow]Sentinel CTF · Crackme Solver[/bold yellow]",
                border_style="bright_cyan",
            )
        )

    skip = set(args.skip)
    all_candidates: list[str] = []

    if "static" not in skip:
        all_candidates.extend(phase1_static(binary, args.input))

    if "ltrace" not in skip:
        all_candidates.extend(phase2_ltrace(binary, args.input))

    if "strace" not in skip:
        phase3_strace(binary, args.input)

    if "gdb" not in skip:
        all_candidates.extend(phase4_gdb(binary, args.input, args.gdb_path))

    if "brute" not in skip:
        phase5_brute(binary, all_candidates)

    section("COMPLETE")
    warn("Automated analysis finished with no flag found.")
    info("Manual next steps:")
    console.print("    • Load in Ghidra / IDA and identify the key comparison routine")
    console.print("    • Try angr for symbolic execution: pip install angr")
    console.print("    • Use Frida for dynamic instrumentation: pip install frida-tools")
    console.print("    • Check for anti-debugging tricks (PTRACE_TRACEME, timing)")
    console.print("    • Try: python3 -c 'from pwn import *; r=process(\"./crackme\")'")


if __name__ == "__main__":
    main()
