#!/usr/bin/env python3
"""
Sentinel CTF Framework — Forensics Template
============================================
pcap_solver.py  ·  PCAP / Network Capture Analysis Script

Standalone PCAP analyser using tshark (Wireshark CLI) and, if
available, Scapy. No Sentinel framework executor required.

Usage
-----
    python pcap_solver.py <pcap_file> [--streams 50] [--output /tmp/pcap_out]

Author  : Sentinel CTF Framework
License : MIT
"""

from __future__ import annotations

import argparse
import json
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
# Helpers
# ---------------------------------------------------------------------------


def section(title: str) -> None:
    """Print a bold section divider."""
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
    """Display flag prominently and exit."""
    msg = f"FLAG FOUND via {source}\n\n  {flag}"
    if RICH:
        console.print(
            Panel(
                Text(msg, style="bold green"),
                title="[bold yellow]🚩  FLAG  🚩[/bold yellow]",
                border_style="bright_green",
                padding=(1, 4),
            )
        )
    else:
        print(f"\n{'='*60}")
        print(f"  🚩  {msg}")
        print(f"{'='*60}")
    sys.exit(0)


def check_flag(text: str, source: str) -> None:
    """Scan text for flags; exit if found."""
    m = FLAG_REGEX.search(text)
    if m:
        found_flag(m.group(0), source)


def run(cmd: list[str], timeout: int = 60, **kw) -> subprocess.CompletedProcess:
    """Run a subprocess safely, returning empty result on error."""
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kw)
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 127, "", f"{cmd[0]}: not found")
    except subprocess.TimeoutExpired:
        warn(f"Timed out: {' '.join(cmd[:4])}")
        return subprocess.CompletedProcess(cmd, 124, "", "timeout")
    except Exception as exc:  # noqa: BLE001
        return subprocess.CompletedProcess(cmd, 1, "", str(exc))


def check_tshark() -> bool:
    """Return True if tshark is available on PATH."""
    r = run(["tshark", "--version"], timeout=5)
    if r.returncode == 127:
        error("tshark not found.")
        info("Install instructions:")
        console.print("    [bold]Ubuntu/Debian:[/bold]  sudo apt install tshark")
        console.print("    [bold]macOS:[/bold]          brew install wireshark")
        console.print("    [bold]Windows:[/bold]        https://www.wireshark.org/download.html")
        return False
    return True


# ---------------------------------------------------------------------------
# Step 1 — Protocol hierarchy / statistics
# ---------------------------------------------------------------------------


def step_protocol_hierarchy(pcap: str) -> None:
    """List all protocols present in the capture."""
    section("STEP 1 · Protocol Hierarchy")
    r = run(["tshark", "-r", pcap, "-qz", "io,phs"], timeout=30)
    if r.returncode != 0:
        error(r.stderr[:300])
        return
    output = r.stdout
    check_flag(output, "protocol hierarchy")
    info("Protocol breakdown:")
    for line in output.splitlines()[:50]:
        console.print(f"    {line}")


# ---------------------------------------------------------------------------
# Step 2 — Conversation / endpoint summary
# ---------------------------------------------------------------------------


def step_conversations(pcap: str) -> None:
    """Summarise TCP/UDP conversations."""
    section("STEP 2 · Conversations & Endpoints")
    for proto in ("tcp", "udp"):
        r = run(["tshark", "-r", pcap, "-qz", f"conv,{proto}"], timeout=30)
        if r.returncode == 0 and r.stdout.strip():
            info(f"{proto.upper()} conversations:")
            for line in r.stdout.splitlines()[:30]:
                console.print(f"    {line}")
            check_flag(r.stdout, f"{proto} conversations")


# ---------------------------------------------------------------------------
# Step 3 — HTTP object export
# ---------------------------------------------------------------------------


def step_http_objects(pcap: str, output_dir: str) -> None:
    """Export all HTTP objects (files) from the capture."""
    section("STEP 3 · HTTP Object Extraction")
    http_dir = Path(output_dir) / "http_objects"
    http_dir.mkdir(parents=True, exist_ok=True)

    r = run(
        ["tshark", "-r", pcap, "--export-objects", f"http,{http_dir}"],
        timeout=60,
    )
    exported = list(http_dir.iterdir())
    if exported:
        success(f"Exported {len(exported)} HTTP object(s) to: {http_dir}")
        for f in exported:
            info(f"  {f.name} ({f.stat().st_size:,} bytes)")
            try:
                text = f.read_text(errors="replace")
                check_flag(text, f"http-object:{f.name}")
            except Exception:
                pass
    else:
        info("No HTTP objects found (or tshark export-objects failed)")
        if r.stderr:
            warn(r.stderr[:200])


# ---------------------------------------------------------------------------
# Step 4 — Credential extraction (HTTP auth + POST bodies)
# ---------------------------------------------------------------------------


def step_credentials(pcap: str) -> None:
    """Extract HTTP credentials from Authorization headers and POST bodies."""
    section("STEP 4 · Credential Extraction")

    # Authorization headers
    r = run(
        [
            "tshark", "-r", pcap, "-Y", "http.authorization",
            "-T", "fields",
            "-e", "ip.src", "-e", "ip.dst",
            "-e", "http.request.uri", "-e", "http.authorization",
        ],
        timeout=30,
    )
    if r.stdout.strip():
        success("HTTP Authorization headers found:")
        for line in r.stdout.splitlines():
            console.print(f"    [yellow]{line}[/yellow]")
            check_flag(line, "HTTP Authorization")
    else:
        info("No HTTP Authorization headers found")

    # POST bodies (form data)
    r2 = run(
        [
            "tshark", "-r", pcap, "-Y", "http.request.method == POST",
            "-T", "fields",
            "-e", "ip.src", "-e", "http.request.uri",
            "-e", "urlencoded-form.key", "-e", "urlencoded-form.value",
        ],
        timeout=30,
    )
    if r2.stdout.strip():
        success("HTTP POST form data found:")
        for line in r2.stdout.splitlines():
            console.print(f"    [yellow]{line}[/yellow]")
            check_flag(line, "HTTP POST")
    else:
        info("No HTTP POST form data found")

    # FTP credentials
    r3 = run(
        [
            "tshark", "-r", pcap, "-Y", "ftp",
            "-T", "fields",
            "-e", "ip.src", "-e", "ftp.request.command", "-e", "ftp.request.arg",
        ],
        timeout=30,
    )
    if r3.stdout.strip():
        success("FTP traffic found:")
        for line in r3.stdout.splitlines():
            console.print(f"    [yellow]{line}[/yellow]")
            check_flag(line, "FTP")

    # Telnet data
    r4 = run(
        ["tshark", "-r", pcap, "-Y", "telnet", "-T", "fields", "-e", "telnet.data"],
        timeout=30,
    )
    if r4.stdout.strip():
        success("Telnet data found:")
        console.print(f"    {r4.stdout[:500]}")
        check_flag(r4.stdout, "Telnet")


# ---------------------------------------------------------------------------
# Step 5 — TCP stream extraction and flag search
# ---------------------------------------------------------------------------


def step_tcp_streams(pcap: str, max_streams: int = 50) -> None:
    """Extract all TCP streams and search each for flags."""
    section(f"STEP 5 · TCP Stream Analysis (up to {max_streams} streams)")

    # Find the number of streams
    r = run(
        ["tshark", "-r", pcap, "-T", "fields", "-e", "tcp.stream", "-q"],
        timeout=30,
    )
    if r.returncode != 0:
        error("Could not enumerate TCP streams")
        return

    stream_ids: set[int] = set()
    for line in r.stdout.splitlines():
        try:
            stream_ids.add(int(line.strip()))
        except ValueError:
            pass

    if not stream_ids:
        info("No TCP streams found")
        return

    info(f"Found {len(stream_ids)} TCP stream(s). Analysing up to {max_streams}…")
    findings: list[tuple[int, str]] = []  # (stream_id, snippet)

    for sid in sorted(stream_ids)[:max_streams]:
        r2 = run(
            ["tshark", "-r", pcap, "-qz", f"follow,tcp,ascii,{sid}"],
            timeout=15,
        )
        content = r2.stdout
        # Check for flag
        m = FLAG_REGEX.search(content)
        if m:
            found_flag(m.group(0), f"TCP stream {sid}")

        # Collect non-trivial streams for summary
        printable_chars = sum(1 for c in content if c.isprintable())
        if printable_chars > 50:
            # Extract first meaningful line
            for line in content.splitlines():
                if len(line.strip()) > 10:
                    findings.append((sid, line.strip()[:100]))
                    break

    if findings:
        if RICH:
            table = Table(title="TCP Stream Snippets", show_lines=True)
            table.add_column("Stream", style="cyan", width=8)
            table.add_column("First Content Line", style="white")
            for sid, snippet in findings[:30]:
                table.add_row(str(sid), snippet)
            console.print(table)
        else:
            for sid, snippet in findings[:30]:
                print(f"  Stream {sid:4d}: {snippet}")
    else:
        info("No non-trivial TCP stream data found")


# ---------------------------------------------------------------------------
# Step 6 — DNS queries
# ---------------------------------------------------------------------------


def step_dns(pcap: str) -> None:
    """Extract DNS queries — useful for data exfil via DNS."""
    section("STEP 6 · DNS Query Analysis")
    r = run(
        [
            "tshark", "-r", pcap, "-Y", "dns.flags.response == 0",
            "-T", "fields", "-e", "ip.src", "-e", "dns.qry.name",
        ],
        timeout=30,
    )
    if r.returncode != 0:
        error("DNS extraction failed")
        return

    queries = [l.strip() for l in r.stdout.splitlines() if l.strip()]
    if not queries:
        info("No DNS queries found")
        return

    info(f"Found {len(queries)} DNS queries:")
    # Look for suspicious (long, base64-like) subdomains
    suspicious = []
    for q in queries:
        parts = q.split("\t")
        name = parts[-1] if parts else q
        # Long subdomain segments may indicate DNS exfiltration
        for part in name.split("."):
            if len(part) > 20:
                suspicious.append(q)
                break

    if suspicious:
        success(f"{len(suspicious)} suspicious (long subdomain) DNS queries:")
        for q in suspicious[:20]:
            console.print(f"    [yellow]{q}[/yellow]")
            check_flag(q, "DNS query")
    else:
        info("No obviously suspicious DNS queries")

    for q in queries[:30]:
        console.print(f"    {q}")
        check_flag(q, "DNS")


# ---------------------------------------------------------------------------
# Step 7 — ICMP / ICMP data exfil
# ---------------------------------------------------------------------------


def step_icmp(pcap: str) -> None:
    """Check ICMP packets for hidden data payloads."""
    section("STEP 7 · ICMP Payload Analysis")
    r = run(
        ["tshark", "-r", pcap, "-Y", "icmp", "-T", "fields",
         "-e", "ip.src", "-e", "ip.dst", "-e", "data"],
        timeout=30,
    )
    if not r.stdout.strip():
        info("No ICMP traffic found")
        return

    lines = r.stdout.strip().splitlines()
    info(f"Found {len(lines)} ICMP packets")
    for line in lines[:20]:
        console.print(f"    {line}")
        check_flag(line, "ICMP data")

    # Reassemble ICMP payloads and try to decode
    all_hex = "".join(
        line.split("\t")[-1] for line in lines if "\t" in line
    ).replace(":", "")
    try:
        decoded = bytes.fromhex(all_hex).decode("latin-1")
        check_flag(decoded, "ICMP reassembled")
        info(f"Reassembled ICMP data (first 200 chars): {decoded[:200]}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Step 8 — Global flag grep across all packet data
# ---------------------------------------------------------------------------


def step_global_flag_search(pcap: str) -> None:
    """Export all packet data and grep for flag regex."""
    section("STEP 8 · Global Flag Search (all packet data)")
    # Use tshark to dump everything as printable
    r = run(
        ["tshark", "-r", pcap, "-T", "pdml"],
        timeout=120,
    )
    if r.returncode != 0:
        # Fall back to text dump
        r = run(["tshark", "-r", pcap, "-V"], timeout=120)

    all_data = r.stdout
    m = FLAG_REGEX.search(all_data)
    if m:
        found_flag(m.group(0), "global search (tshark -V/-T pdml)")
    else:
        info("No flag found in full packet dump")


# ---------------------------------------------------------------------------
# Step 9 — Scapy layer-by-layer analysis (optional)
# ---------------------------------------------------------------------------


def step_scapy(pcap: str) -> None:
    """Use Scapy for deep packet inspection if available."""
    section("STEP 9 · Scapy — Layer-by-Layer Inspection")
    try:
        from scapy.all import rdpcap, Raw  # type: ignore
    except ImportError:
        warn("Scapy not installed. Install with: pip install scapy")
        return

    try:
        packets = rdpcap(pcap)
    except Exception as exc:
        error(f"Scapy failed to read PCAP: {exc}")
        return

    info(f"Scapy loaded {len(packets)} packets")
    proto_counts: dict[str, int] = {}
    raw_payloads: list[bytes] = []

    for pkt in packets:
        # Count protocols
        layer = pkt
        while layer:
            name = layer.__class__.__name__
            proto_counts[name] = proto_counts.get(name, 0) + 1
            layer = layer.payload if hasattr(layer, "payload") else None

        # Collect raw payloads
        if pkt.haslayer(Raw):
            raw_payloads.append(bytes(pkt[Raw]))

    if RICH:
        table = Table(title="Protocol Layer Counts")
        table.add_column("Protocol", style="cyan")
        table.add_column("Count", style="white", justify="right")
        for proto, count in sorted(proto_counts.items(), key=lambda x: -x[1]):
            table.add_row(proto, str(count))
        console.print(table)
    else:
        for proto, count in sorted(proto_counts.items(), key=lambda x: -x[1]):
            print(f"  {proto:20s} : {count}")

    info(f"Analysing {len(raw_payloads)} raw payloads for flags…")
    all_raw = b"".join(raw_payloads)
    try:
        text = all_raw.decode("latin-1")
        m = FLAG_REGEX.search(text)
        if m:
            found_flag(m.group(0), "Scapy raw payload")
        else:
            info("No flag found in raw Scapy payloads")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    p = argparse.ArgumentParser(
        description="Sentinel CTF — PCAP Solver",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("pcap", help="Path to the .pcap / .pcapng file")
    p.add_argument(
        "--streams", type=int, default=50, metavar="N",
        help="Maximum TCP streams to follow (default: 50)",
    )
    p.add_argument(
        "--output", default=None, metavar="DIR",
        help="Directory for exported objects (default: <pcap>_analysis/)",
    )
    p.add_argument(
        "--skip", nargs="+", default=[],
        choices=["protocols", "conversations", "http", "creds", "streams",
                 "dns", "icmp", "global", "scapy"],
        help="Skip specific steps",
    )
    return p.parse_args()


def main() -> None:
    """Entry point."""
    args = parse_args()
    pcap = args.pcap

    if not Path(pcap).is_file():
        error(f"File not found: {pcap}")
        sys.exit(1)

    output_dir = args.output or str(Path(pcap).parent / f"{Path(pcap).stem}_analysis")
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    if RICH:
        console.print(
            Panel(
                f"[bold]PCAP:[/bold] {pcap}\n"
                f"[bold]Size:[/bold] {Path(pcap).stat().st_size:,} bytes\n"
                f"[bold]Output:[/bold] {output_dir}",
                title="[bold yellow]Sentinel CTF · PCAP Solver[/bold yellow]",
                border_style="bright_cyan",
            )
        )

    if not check_tshark():
        sys.exit(1)

    skip = set(args.skip)

    if "protocols" not in skip:
        step_protocol_hierarchy(pcap)

    if "conversations" not in skip:
        step_conversations(pcap)

    if "http" not in skip:
        step_http_objects(pcap, output_dir)

    if "creds" not in skip:
        step_credentials(pcap)

    if "streams" not in skip:
        step_tcp_streams(pcap, max_streams=args.streams)

    if "dns" not in skip:
        step_dns(pcap)

    if "icmp" not in skip:
        step_icmp(pcap)

    if "global" not in skip:
        step_global_flag_search(pcap)

    if "scapy" not in skip:
        step_scapy(pcap)

    section("COMPLETE")
    warn("No flag found automatically. Check exported objects in: " + output_dir)
    info("Manual tips:")
    console.print("    • Open the PCAP in Wireshark and use: Edit → Find Packet")
    console.print("    • Inspect encrypted TLS streams (check for SSL keys in env)")
    console.print("    • Try NetworkMiner for passive file reassembly")


if __name__ == "__main__":
    main()
