"""
sentinel_ctf.cli.main
=====================
The `ctf` CLI. Entry point registered in pyproject.toml.

Usage examples:
    ctf new "Web Login Bypass" --cat web --host app.example.com --port 80
    ctf list
    ctf triage <challenge-id> --file files/challenge.bin
    ctf run nmap <challenge-id> --target 10.10.10.5
    ctf solve <challenge-id> --flag "flag{...}"
    ctf writeup <challenge-id>
    ctf ssh-test
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich import print as rprint

from sentinel_ctf.core.config import config
from sentinel_ctf.core.database import (
    init_db, save_challenge, get_challenge, list_challenges, delete_challenge, list_jobs
)
from sentinel_ctf.core.models import Category, Challenge, ChallengeStatus, Difficulty
from sentinel_ctf.core.workspace import create_workspace, open_workspace, archive_workspace
from sentinel_ctf.core.flagfinder import scan_text

app = typer.Typer(
    name="ctf",
    help="Sentinel CTF Framework — challenge management and automation",
    no_args_is_help=True,
)
console = Console()

# Initialise DB on every CLI invocation
init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_executor(use_kali: bool = True):
    """Return either the SSH or local executor based on flag."""
    if use_kali:
        from sentinel_ctf.executor.ssh import KaliSSHExecutor
        return KaliSSHExecutor()
    else:
        from sentinel_ctf.executor.local import LocalExecutor
        return LocalExecutor()


def _require_challenge(challenge_id: str) -> Challenge:
    ch = get_challenge(challenge_id)
    if not ch:
        console.print(f"[red]Challenge not found: {challenge_id}[/red]")
        raise typer.Exit(1)
    return ch


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

@app.command("new")
def cmd_new(
    name: str = typer.Argument(..., help="Challenge name"),
    cat: str = typer.Option("misc", "--cat", "-c", help="Category: web|forensics|crypto|reversing|pwn|osint|misc"),
    difficulty: str = typer.Option("medium", "--diff", "-d", help="easy|medium|hard|insane"),
    platform: str = typer.Option("", "--platform", "-p", help="Platform name e.g. HackTheBox"),
    event: str = typer.Option("", "--event", "-e", help="CTF event name"),
    host: str = typer.Option("", "--host", help="Target host"),
    port: int = typer.Option(0, "--port", help="Target port"),
    points: int = typer.Option(0, "--points", help="Point value"),
    description: str = typer.Option("", "--desc", help="Challenge description"),
    flag_format: str = typer.Option(r"flag\{[^}]+\}", "--flag-format", help="Flag regex"),
):
    """Create a new challenge workspace."""
    try:
        category = Category(cat.lower())
        diff = Difficulty(difficulty.lower())
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)

    ch = Challenge(
        name=name,
        category=category,
        difficulty=diff,
        platform=platform,
        event=event,
        target_host=host or None,
        target_port=port or None,
        points=points,
        description=description,
        flag_format=flag_format,
    )
    ch.mark_in_progress()
    workspace = create_workspace(ch)
    save_challenge(ch)

    console.print(f"[bold green]Created challenge:[/bold green] {name}")
    console.print(f"  ID:        {ch.id}")
    console.print(f"  Category:  {category.value}")
    console.print(f"  Workspace: {workspace}")
    console.print(f"\n[cyan]Open workspace:[/cyan] ctf open {ch.id}")
    console.print(f"[cyan]Run triage:[/cyan]    ctf triage {ch.id}")


@app.command("list")
def cmd_list(
    cat: str = typer.Option("", "--cat", "-c", help="Filter by category"),
    status: str = typer.Option("", "--status", "-s", help="Filter by status"),
):
    """List all challenges."""
    category = Category(cat.lower()) if cat else None
    st = ChallengeStatus(status.lower()) if status else None
    challenges = list_challenges(category=category, status=st)

    if not challenges:
        console.print("[yellow]No challenges found.[/yellow]")
        return

    table = Table(title=f"Challenges ({len(challenges)} total)")
    table.add_column("ID (short)", style="dim", width=10)
    table.add_column("Name", style="bold")
    table.add_column("Category", style="cyan")
    table.add_column("Difficulty", style="yellow")
    table.add_column("Status", style="green")
    table.add_column("Flag", style="red")
    table.add_column("Platform", style="dim")

    for ch in challenges:
        flag_display = "✓" if ch.flag else "-"
        status_color = {
            ChallengeStatus.SOLVED: "[green]solved[/green]",
            ChallengeStatus.IN_PROGRESS: "[yellow]in_progress[/yellow]",
            ChallengeStatus.STUCK: "[red]stuck[/red]",
            ChallengeStatus.NEW: "[dim]new[/dim]",
        }.get(ch.status, ch.status.value)
        table.add_row(
            ch.id[:8],
            ch.name,
            ch.category.value,
            ch.difficulty.value,
            status_color,
            flag_display,
            ch.platform or "-",
        )
    console.print(table)


@app.command("info")
def cmd_info(challenge_id: str = typer.Argument(..., help="Challenge ID (or prefix)")):
    """Show detailed info for a challenge."""
    ch = _require_challenge(challenge_id)
    console.rule(f"[bold]{ch.name}[/bold]")
    console.print(f"ID:          {ch.id}")
    console.print(f"Category:    {ch.category.value}")
    console.print(f"Difficulty:  {ch.difficulty.value}")
    console.print(f"Platform:    {ch.platform or '-'}")
    console.print(f"Event:       {ch.event or '-'}")
    console.print(f"Points:      {ch.points}")
    console.print(f"Status:      {ch.status.value}")
    console.print(f"Target:      {ch.target_host or '-'}:{ch.target_port or '-'}")
    console.print(f"Flag:        {ch.flag or '(not solved)'}")
    console.print(f"Workspace:   {ch.workspace_dir or '(none)'}")
    console.print(f"Tags:        {', '.join(ch.tags) or '-'}")
    console.print(f"Description: {ch.description or '-'}")

    jobs = list_jobs(ch.id)
    if jobs:
        console.print(f"\n[cyan]Jobs ({len(jobs)}):[/cyan]")
        for j in jobs:
            icon = "✓" if j.status.value == "done" else "✗"
            console.print(f"  {icon} [{j.tool}] {j.command[:60]} — {j.status.value}")


@app.command("open")
def cmd_open(challenge_id: str = typer.Argument(..., help="Challenge ID")):
    """Open the challenge workspace in Windows Explorer."""
    ch = _require_challenge(challenge_id)
    if not ch.workspace_dir:
        workspace = create_workspace(ch)
        save_challenge(ch)
    open_workspace(ch)
    console.print(f"[green]Opened {ch.workspace_dir}[/green]")


@app.command("triage")
def cmd_triage(
    challenge_id: str = typer.Argument(..., help="Challenge ID"),
    file: str = typer.Option("", "--file", "-f", help="Path to file on Kali to triage"),
    local: bool = typer.Option(False, "--local", help="Use local executor instead of Kali SSH"),
):
    """Run the automated triage workflow for a challenge."""
    ch = _require_challenge(challenge_id)

    async def _run():
        executor = _get_executor(use_kali=not local)
        async with executor:
            from sentinel_ctf.workflows.triage import run_triage
            return await run_triage(ch, executor, file_path=file or None)

    findings = asyncio.run(_run())

    if findings.get("flags_found"):
        console.print(f"\n[bold red]FLAGS FOUND:[/bold red] {findings['flags_found']}")
        flag = findings["flags_found"][0]
        if typer.confirm(f"Mark challenge as solved with flag '{flag}'?"):
            ch.mark_solved(flag)
            save_challenge(ch)
            console.print("[green]Challenge marked as solved.[/green]")


@app.command("run")
def cmd_run(
    tool_name: str = typer.Argument(..., help="Tool to run: nmap|ffuf|gobuster|triage|checksec|strings|whois|volatility|decoder"),
    challenge_id: str = typer.Argument(..., help="Challenge ID"),
    target: str = typer.Option("", "--target", "-t", help="Target host/IP/URL"),
    file: str = typer.Option("", "--file", "-f", help="File path on Kali"),
    ports: str = typer.Option("-", "--ports", help="Port range for nmap"),
    wordlist: str = typer.Option("", "--wordlist", "-w", help="Wordlist path"),
    local: bool = typer.Option(False, "--local", help="Use local executor"),
    timeout: float = typer.Option(300.0, "--timeout", help="Timeout in seconds"),
    extra: str = typer.Option("", "--extra", help="Extra flags to pass to the tool"),
):
    """Run a specific tool against a challenge."""
    ch = _require_challenge(challenge_id)

    from sentinel_ctf.core.database import save_job
    from sentinel_ctf.core.models import Job

    async def _run():
        executor = _get_executor(use_kali=not local)
        async with executor:
            kwargs: dict = {}
            if target:
                kwargs["target"] = target
            if file:
                kwargs["filepath"] = file
            if ports:
                kwargs["ports"] = ports
            if wordlist:
                kwargs["wordlist"] = wordlist
            if extra:
                kwargs["extra_flags"] = extra

            tool_map = {
                # ── Web ──────────────────────────────────────────────────
                "nmap":         ("sentinel_ctf.tools.web.nmap",           "NmapTool"),
                "ffuf":         ("sentinel_ctf.tools.web.ffuf",           "FfufTool"),
                "gobuster":     ("sentinel_ctf.tools.web.gobuster",       "GobusterTool"),
                "sqlmap":       ("sentinel_ctf.tools.web.sqlmap",         "SqlmapTool"),
                "nikto":        ("sentinel_ctf.tools.web.nikto",          "NiktoTool"),
                "curl":         ("sentinel_ctf.tools.web.curl_tool",      "CurlTool"),
                "wfuzz":        ("sentinel_ctf.tools.web.wfuzz",          "WfuzzTool"),
                "burp":         ("sentinel_ctf.tools.web.burp_repeater",  "BurpRepeaterTool"),
                "jwt":          ("sentinel_ctf.tools.web.jwt_tool",       "JwtTool"),
                "param_miner":  ("sentinel_ctf.tools.web.param_miner",    "ParamMinerTool"),
                # ── Forensics ─────────────────────────────────────────────
                "triage":       ("sentinel_ctf.tools.forensics.triage",        "TriageTool"),
                "volatility":   ("sentinel_ctf.tools.forensics.volatility",    "VolatilityTool"),
                "pcap":         ("sentinel_ctf.tools.forensics.pcap_tool",     "PcapTool"),
                "steghide":     ("sentinel_ctf.tools.forensics.steg.steghide_tool", "SteghideTool"),
                "zsteg":        ("sentinel_ctf.tools.forensics.steg.zsteg_tool",    "ZstegTool"),
                "lsb":          ("sentinel_ctf.tools.forensics.steg.lsb_tool",      "LsbTool"),
                "hexdump":      ("sentinel_ctf.tools.forensics.hexdump_tool",   "HexdumpTool"),
                "strings_grep": ("sentinel_ctf.tools.forensics.strings_grep",   "StringsGrepTool"),
                "foremost":     ("sentinel_ctf.tools.forensics.foremost_tool",  "ForemostTool"),
                "binwalk":      ("sentinel_ctf.tools.misc.binwalk_tool",        "BinwalkTool"),
                "exiftool":     ("sentinel_ctf.tools.misc.exiftool_tool",       "ExiftoolTool"),
                # ── Crypto ────────────────────────────────────────────────
                "decoder":      ("sentinel_ctf.tools.crypto.decoder",       "DecoderTool"),
                "rsa":          ("sentinel_ctf.tools.crypto.rsa_tool",      "RsaTool"),
                "hashcrack":    ("sentinel_ctf.tools.crypto.hash_cracker",  "HashCrackerTool"),
                "xor":          ("sentinel_ctf.tools.crypto.xor_tool",      "XorTool"),
                "vigenere":     ("sentinel_ctf.tools.crypto.vigenere_tool", "VigenereTool"),
                "aes":          ("sentinel_ctf.tools.crypto.aes_tool",      "AesTool"),
                # ── Reversing ─────────────────────────────────────────────
                "checksec":     ("sentinel_ctf.tools.reversing.checksec",       "ChecksecTool"),
                "strings":      ("sentinel_ctf.tools.reversing.strings_tool",   "StringsTool"),
                "ghidra":       ("sentinel_ctf.tools.reversing.ghidra_tool",    "GhidraTool"),
                "r2":           ("sentinel_ctf.tools.reversing.radare2_tool",   "Radare2Tool"),
                "strace":       ("sentinel_ctf.tools.reversing.strace_tool",    "StraceTool"),
                # ── PWN ───────────────────────────────────────────────────
                "pwntools":     ("sentinel_ctf.tools.pwn.pwntools_runner",  "PwntoolsRunner"),
                "gdb":          ("sentinel_ctf.tools.pwn.gdb_tool",         "GdbTool"),
                "ropgadget":    ("sentinel_ctf.tools.pwn.rop_finder",       "RopFinderTool"),
                "heap":         ("sentinel_ctf.tools.pwn.heap_tool",        "HeapTool"),
                # ── OSINT ─────────────────────────────────────────────────
                "whois":        ("sentinel_ctf.tools.osint.whois_tool",          "WhoisTool"),
                "subfinder":    ("sentinel_ctf.tools.osint.subfinder_tool",      "SubfinderTool"),
                "theharvester": ("sentinel_ctf.tools.osint.theharvester_tool",   "TheHarvesterTool"),
                "shodan":       ("sentinel_ctf.tools.osint.shodan_tool",         "ShodanTool"),
                "wayback":      ("sentinel_ctf.tools.osint.wayback_tool",        "WaybackTool"),
                # ── Misc ──────────────────────────────────────────────────
                "qr":           ("sentinel_ctf.tools.misc.qr_tool",     "QrTool"),
                "audio":        ("sentinel_ctf.tools.misc.audio_tool",  "AudioTool"),
                "ltrace":       ("sentinel_ctf.tools.misc.ltrace_tool", "LtraceTool"),
            }

            if tool_name not in tool_map:
                console.print(f"[red]Unknown tool: {tool_name}. Options: {', '.join(tool_map)}[/red]")
                raise typer.Exit(1)

            module_path, class_name = tool_map[tool_name]
            import importlib
            module = importlib.import_module(module_path)
            ToolClass = getattr(module, class_name)
            tool_instance = ToolClass(executor)

            cmd = tool_instance.build_command(**kwargs)
            console.print(f"[cyan]Running:[/cyan] {cmd}")

            result = await tool_instance.run(timeout=timeout, **kwargs)
            job = Job(challenge_id=ch.id, tool=tool_name, command=cmd)
            job.complete(result)
            save_job(job)
            return result

    result = asyncio.run(_run())
    console.print(f"\n[bold]Output:[/bold]\n{result.stdout[:3000]}")
    if result.stderr:
        console.print(f"[red]Stderr:[/red] {result.stderr[:500]}")
    if result.flags_found:
        console.print(f"[bold red]FLAGS: {result.flags_found}[/bold red]")


@app.command("solve")
def cmd_solve(
    challenge_id: str = typer.Argument(..., help="Challenge ID"),
    flag: str = typer.Argument(..., help="The flag string"),
):
    """Mark a challenge as solved with a flag."""
    ch = _require_challenge(challenge_id)
    ch.mark_solved(flag)
    save_challenge(ch)

    # Archive workspace to writeups
    writeups_root = config.HOST_CHALLENGE_ROOT.parent / "writeups"
    archive_workspace(ch, writeups_root)

    console.print(f"[bold green]Solved![/bold green] {ch.name}")
    console.print(f"Flag: {flag}")
    console.print(f"Archived to: {writeups_root / ch.category.value}")


@app.command("writeup")
def cmd_writeup(
    challenge_id: str = typer.Argument(..., help="Challenge ID"),
    output: str = typer.Option("", "--output", "-o", help="Output directory (default: writeups/<category>/)"),
):
    """Generate a markdown writeup for a solved challenge."""
    ch = _require_challenge(challenge_id)
    if not ch.flag:
        console.print("[red]Challenge is not solved yet. Set the flag with: ctf solve <id> <flag>[/red]")
        raise typer.Exit(1)

    from sentinel_ctf.workflows.writeup_gen import generate_writeup, save_writeup

    writeup = generate_writeup(ch)
    out_dir = Path(output) if output else config.HOST_CHALLENGE_ROOT.parent / "writeups" / ch.category.value
    path = save_writeup(writeup, out_dir)
    console.print(f"[green]Writeup saved to:[/green] {path}")


@app.command("ssh-test")
def cmd_ssh_test():
    """Test the SSH connection to the Kali VM."""
    console.print(f"[cyan]Testing SSH connection to {config.KALI_HOST}:{config.KALI_PORT} as {config.KALI_USER}[/cyan]")

    async def _test():
        from sentinel_ctf.executor.ssh import KaliSSHExecutor
        async with KaliSSHExecutor() as ex:
            result = await ex.run("uname -a && whoami && uptime")
            return result

    try:
        result = asyncio.run(_test())
        console.print("[bold green]Connection successful![/bold green]")
        console.print(result.stdout)
    except Exception as e:
        console.print(f"[bold red]Connection failed:[/bold red] {e}")
        console.print("\n[yellow]Tip: Start the Cloudflare tunnel first:[/yellow]")
        console.print(f"  cloudflared access tcp --hostname {config.KALI_TUNNEL_HOSTNAME} --url 127.0.0.1:{config.KALI_PORT}")
        raise typer.Exit(1)


@app.command("delete")
def cmd_delete(
    challenge_id: str = typer.Argument(..., help="Challenge ID"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation"),
):
    """Delete a challenge and all its jobs from the database."""
    ch = _require_challenge(challenge_id)
    if not yes:
        typer.confirm(f"Delete challenge '{ch.name}' and all its jobs?", abort=True)
    delete_challenge(challenge_id)
    console.print(f"[yellow]Deleted:[/yellow] {ch.name}")


@app.command("flag-scan")
def cmd_flag_scan(
    text: str = typer.Argument(..., help="Text to scan for flags"),
    regex: str = typer.Option("", "--regex", "-r", help="Custom flag regex"),
):
    """Scan arbitrary text for flag patterns."""
    flags = scan_text(text, regex or None)
    if flags:
        for f in flags:
            console.print(f"[bold red]{f}[/bold red]")
    else:
        console.print("[yellow]No flags found.[/yellow]")


@app.command("auto-solve")
def cmd_auto_solve(
    challenge_id: str = typer.Argument(..., help="Challenge ID (or prefix)"),
    file: str = typer.Option("", "--file", "-f", help="Path to challenge file on Kali"),
    iterations: int = typer.Option(5, "--iterations", "-n", help="Max AI iterations"),
    local: bool = typer.Option(False, "--local", help="Use local executor instead of SSH"),
):
    """AI-assisted auto-solve: triage → AI suggests tool → run → repeat."""
    ch = _require_challenge(challenge_id)
    console.rule(f"[bold cyan]Auto-Solve: {ch.name}[/bold cyan]")

    async def _run():
        from sentinel_ctf.workflows.auto_solve import run_auto_solve
        if local:
            from sentinel_ctf.executor.local import LocalExecutor
            async with LocalExecutor() as ex:
                return await run_auto_solve(ch, ex, file_path=file or None,
                                            max_iterations=iterations)
        else:
            from sentinel_ctf.executor.ssh import KaliSSHExecutor
            async with KaliSSHExecutor() as ex:
                return await run_auto_solve(ch, ex, file_path=file or None,
                                            max_iterations=iterations)

    try:
        result = asyncio.run(_run())
        if result["flags_found"]:
            console.print(f"\n[bold green]🚩 FLAGS: {result['flags_found']}[/bold green]")
            flag = result["flags_found"][0]
            typer.confirm(f"\nMark '{ch.name}' as solved with flag '{flag}'?", default=True)
            from sentinel_ctf.core.database import save_challenge
            ch.mark_solved(flag)
            save_challenge(ch)
            console.print("[green]Marked as solved.[/green]")
        else:
            console.print("[yellow]No flag found automatically. Review the output above.[/yellow]")
    except Exception as e:
        console.print(f"[bold red]Auto-solve error:[/bold red] {e}")
        raise typer.Exit(1)


@app.command("tools")
def cmd_tools():
    """List all available tools with their categories."""
    from rich.table import Table
    table = Table(title="Available Tools (47 total)", show_header=True)
    table.add_column("Name", style="cyan", width=16)
    table.add_column("Category", style="magenta", width=12)
    table.add_column("Description")

    _tool_info = [
        ("nmap",         "web",       "Port and service scan"),
        ("ffuf",         "web",       "Web fuzzer (directories, params)"),
        ("gobuster",     "web",       "Directory and DNS brute force"),
        ("sqlmap",       "web",       "Automated SQL injection"),
        ("nikto",        "web",       "Web server vulnerability scanner"),
        ("curl",         "web",       "HTTP request with custom headers/body"),
        ("wfuzz",        "web",       "Advanced web fuzzer"),
        ("burp",         "web",       "Replay raw HTTP requests (Burp-style)"),
        ("jwt",          "web",       "JWT decode, none-alg attack"),
        ("param_miner",  "web",       "Hidden parameter discovery"),
        ("triage",       "forensics", "Multi-tool file triage"),
        ("volatility",   "forensics", "Memory forensics (Volatility 3)"),
        ("pcap",         "forensics", "PCAP analysis with tshark"),
        ("steghide",     "forensics", "Steghide steg extraction"),
        ("zsteg",        "forensics", "PNG/BMP LSB steg analysis"),
        ("lsb",          "forensics", "Pure-Python LSB extraction"),
        ("hexdump",      "forensics", "Hex dump with magic byte ID"),
        ("strings_grep", "forensics", "Targeted string extraction"),
        ("foremost",     "forensics", "File carving from blobs"),
        ("binwalk",      "misc",      "Binary analysis & extraction"),
        ("exiftool",     "misc",      "Metadata extraction (GPS, EXIF)"),
        ("decoder",      "crypto",    "Multi-encoding decode chain"),
        ("rsa",          "crypto",    "RSA attack suite"),
        ("hashcrack",    "crypto",    "Hash cracking (hashcat/john)"),
        ("xor",          "crypto",    "XOR brute force & key detection"),
        ("vigenere",     "crypto",    "Vigenère key recovery (IC)"),
        ("aes",          "crypto",    "AES ECB/CBC analysis"),
        ("checksec",     "reversing", "Binary protection checker"),
        ("strings",      "reversing", "Extract printable strings"),
        ("ghidra",       "reversing", "Ghidra headless decompilation"),
        ("r2",           "reversing", "Radare2 binary analysis"),
        ("strace",       "reversing", "System call tracer"),
        ("pwntools",     "pwn",       "Run pwntools exploit on Kali"),
        ("gdb",          "pwn",       "GDB crash analysis & offsets"),
        ("ropgadget",    "pwn",       "ROP gadget finder"),
        ("heap",         "pwn",       "Heap chunk & bin analysis"),
        ("whois",        "osint",     "Domain/IP WHOIS lookup"),
        ("subfinder",    "osint",     "Subdomain enumeration"),
        ("theharvester", "osint",     "Email/host OSINT"),
        ("shodan",       "osint",     "Shodan host/search lookup"),
        ("wayback",      "osint",     "Wayback Machine archive search"),
        ("qr",           "misc",      "QR code & barcode decoder"),
        ("audio",        "misc",      "Audio steg analysis"),
        ("ltrace",       "misc",      "Library call tracer (strcmp etc)"),
    ]
    for name, cat, desc in _tool_info:
        table.add_row(name, cat, desc)
    console.print(table)
    console.print("\nUsage: [cyan]python -m sentinel_ctf run <challenge_id> <tool_name>[/cyan]")


if __name__ == "__main__":
    app()
