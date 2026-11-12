"""
sentinel_ctf.workflows.triage
==============================
Universal triage workflow. Runs the right set of tools for a given category
and aggregates results into a structured report.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

from sentinel_ctf.core.models import Category, Challenge, Job, JobResult
from sentinel_ctf.core.database import save_job
from sentinel_ctf.core.flagfinder import scan_all
from sentinel_ctf.executor.base import BaseExecutor

console = Console()


async def run_triage(
    challenge: Challenge,
    executor: BaseExecutor,
    file_path: str | None = None,
) -> dict[str, Any]:
    """
    Run the appropriate triage workflow for the challenge category.

    Returns a summary dict with all findings.
    """
    category = challenge.category
    findings: dict[str, Any] = {
        "challenge": challenge.name,
        "category": category.value,
        "flags_found": [],
        "tools_run": [],
        "results": {},
    }

    if category == Category.FORENSICS:
        results = await _triage_forensics(challenge, executor, file_path)
    elif category == Category.WEB:
        results = await _triage_web(challenge, executor)
    elif category == Category.CRYPTO:
        results = await _triage_crypto(challenge, executor, file_path)
    elif category in (Category.REVERSING, Category.PWN):
        results = await _triage_binary(challenge, executor, file_path)
    elif category == Category.OSINT:
        results = await _triage_osint(challenge, executor)
    else:
        results = await _triage_generic(challenge, executor, file_path)

    findings["results"] = results
    # Aggregate flags found across all tool outputs
    all_text = [str(v) for v in results.values()]
    findings["flags_found"] = scan_all(all_text, challenge.flag_format)
    findings["tools_run"] = list(results.keys())

    _print_triage_summary(findings)
    return findings


# ---------------------------------------------------------------------------
# Category-specific triage pipelines
# ---------------------------------------------------------------------------

async def _triage_forensics(
    challenge: Challenge, executor: BaseExecutor, file_path: str | None
) -> dict[str, Any]:
    from sentinel_ctf.tools.forensics.triage import TriageTool
    results: dict[str, Any] = {}
    if not file_path:
        console.print("[yellow]No file path provided for forensics triage.[/yellow]")
        return results

    console.print(f"[cyan]Running forensics triage on {file_path}[/cyan]")
    tool = TriageTool(executor)
    job_result = await tool.triage(filepath=file_path)
    results["triage"] = job_result.parsed
    _record_job(challenge, "triage", f"triage {file_path}", job_result)
    return results


async def _triage_web(
    challenge: Challenge, executor: BaseExecutor
) -> dict[str, Any]:
    from sentinel_ctf.tools.web.nmap import NmapTool
    from sentinel_ctf.tools.web.ffuf import FfufTool
    results: dict[str, Any] = {}
    target = challenge.target_host

    if not target:
        console.print("[yellow]No target host for web triage.[/yellow]")
        return results

    console.print(f"[cyan]Running nmap on {target}[/cyan]")
    nmap = NmapTool(executor)
    nmap_result = await nmap.scan(target=target)
    results["nmap"] = nmap_result.parsed
    _record_job(challenge, "nmap", f"nmap {target}", nmap_result)

    # If web port found, run ffuf
    open_ports = nmap_result.parsed.get("open_ports", [])
    web_port = next(
        (p["port"] for p in open_ports if p.get("service") in ("http", "https", "http-alt")),
        None,
    )
    if web_port:
        url = f"http://{target}:{web_port}/FUZZ"
        console.print(f"[cyan]Running ffuf on {url}[/cyan]")
        ffuf = FfufTool(executor)
        ffuf_result = await ffuf.fuzz(url=url)
        results["ffuf"] = ffuf_result.parsed
        _record_job(challenge, "ffuf", f"ffuf {url}", ffuf_result)

    return results


async def _triage_crypto(
    challenge: Challenge, executor: BaseExecutor, file_path: str | None
) -> dict[str, Any]:
    from sentinel_ctf.tools.crypto.decoder import DecoderTool
    results: dict[str, Any] = {}

    # Try decoding the description
    if challenge.description:
        console.print("[cyan]Running decode attempts on challenge description[/cyan]")
        tool = DecoderTool(executor)
        decoded = DecoderTool.try_all(challenge.description)
        results["decoded_description"] = decoded

    if file_path:
        result = await executor.run(f"cat {file_path!r} 2>/dev/null | head -c 2000")
        console.print("[cyan]Running decode attempts on file contents[/cyan]")
        decoded_file = DecoderTool.try_all(result.stdout.strip())
        results["decoded_file"] = decoded_file

    return results


async def _triage_binary(
    challenge: Challenge, executor: BaseExecutor, file_path: str | None
) -> dict[str, Any]:
    from sentinel_ctf.tools.reversing.checksec import ChecksecTool
    from sentinel_ctf.tools.reversing.strings_tool import StringsTool
    results: dict[str, Any] = {}

    if not file_path:
        console.print("[yellow]No binary file path provided.[/yellow]")
        return results

    console.print(f"[cyan]Running checksec on {file_path}[/cyan]")
    checksec = ChecksecTool(executor)
    cs_result = await checksec.check(filepath=file_path)
    results["checksec"] = cs_result.parsed
    _record_job(challenge, "checksec", f"checksec {file_path}", cs_result)

    console.print(f"[cyan]Running strings on {file_path}[/cyan]")
    strings = StringsTool(executor)
    st_result = await strings.extract(filepath=file_path)
    results["strings"] = st_result.parsed
    _record_job(challenge, "strings", f"strings {file_path}", st_result)

    return results


async def _triage_osint(
    challenge: Challenge, executor: BaseExecutor
) -> dict[str, Any]:
    from sentinel_ctf.tools.osint.whois_tool import WhoisTool
    results: dict[str, Any] = {}
    target = challenge.target_host or challenge.description.split()[0] if challenge.description else None

    if target:
        console.print(f"[cyan]Running whois on {target}[/cyan]")
        tool = WhoisTool(executor)
        result = await tool.lookup(target=target)
        results["whois"] = result.parsed
        _record_job(challenge, "whois", f"whois {target}", result)

    return results


async def _triage_generic(
    challenge: Challenge, executor: BaseExecutor, file_path: str | None
) -> dict[str, Any]:
    results: dict[str, Any] = {}
    if file_path:
        raw = await executor.run(f"file {file_path!r}; strings -n 8 {file_path!r} | head -50")
        results["generic_file"] = {"output": raw.stdout}
    return results


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _record_job(challenge: Challenge, tool: str, command: str, result: JobResult) -> None:
    job = Job(challenge_id=challenge.id, tool=tool, command=command)
    job.complete(result)
    save_job(job)


def _print_triage_summary(findings: dict[str, Any]) -> None:
    console.rule(f"[bold green]Triage: {findings['challenge']}[/bold green]")
    table = Table(title="Tools run")
    table.add_column("Tool", style="cyan")
    table.add_column("Keys found", style="white")
    for tool_name in findings["tools_run"]:
        tool_data = findings["results"].get(tool_name, {})
        keys = ", ".join(list(tool_data.keys())[:5]) if isinstance(tool_data, dict) else str(tool_data)[:60]
        table.add_row(tool_name, keys)
    console.print(table)

    if findings["flags_found"]:
        console.print(f"[bold red]FLAGS FOUND: {findings['flags_found']}[/bold red]")
    else:
        console.print("[yellow]No flags found yet.[/yellow]")
