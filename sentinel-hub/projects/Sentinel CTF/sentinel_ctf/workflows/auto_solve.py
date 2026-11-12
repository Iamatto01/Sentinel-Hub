"""
sentinel_ctf.workflows.auto_solve
===================================
AI-assisted challenge solve loop using the Sentinel Router.

Flow:
  1. Run triage → collect findings
  2. Send findings + playbook context to AI
  3. AI suggests next tool + kwargs
  4. Run suggested tool, scan for flags
  5. Repeat until flag found or max_iterations reached
"""
from __future__ import annotations

import asyncio
import importlib
import json
import re
from pathlib import Path
from typing import Any

import httpx
from rich.console import Console
from rich.panel import Panel

from sentinel_ctf.core.config import config
from sentinel_ctf.core.flagfinder import scan_text
from sentinel_ctf.core.models import Challenge, Category
from sentinel_ctf.executor.base import BaseExecutor

console = Console()


# ---------------------------------------------------------------------------
# AI helpers
# ---------------------------------------------------------------------------

async def ask_ai(
    prompt: str,
    system: str = "You are an expert CTF player. Be concise and actionable.",
    model: str = "sentinel-sonnet",
) -> str:
    """POST to Sentinel Router and return assistant message content."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{config.ROUTER_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {config.ROUTER_API_KEY}"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except Exception as exc:
        return f"AI unavailable: {exc}"


async def get_playbook(category: Category) -> str:
    """Read playbook markdown for the given category."""
    playbook_path = (
        Path(__file__).resolve().parent.parent / "playbooks" / f"{category.value}.md"
    )
    try:
        return playbook_path.read_text(encoding="utf-8")
    except Exception:
        return ""


def build_triage_summary(findings: dict) -> str:
    """Convert triage findings dict into a readable text summary."""
    lines = []
    for tool_name, tool_data in findings.items():
        if not isinstance(tool_data, dict):
            continue
        lines.append(f"\n[Tool: {tool_name}]")
        # Flags
        flags = tool_data.get("flags_found", [])
        if flags:
            lines.append(f"  🚩 FLAGS FOUND: {flags}")
        # Key fields
        for key, val in tool_data.items():
            if key == "flags_found":
                continue
            if isinstance(val, list) and val:
                preview = val[:5]
                lines.append(f"  {key}: {preview}")
            elif isinstance(val, (str, int, bool)) and val:
                snippet = str(val)[:200]
                lines.append(f"  {key}: {snippet}")
    return "\n".join(lines) if lines else "No significant findings yet."


# ---------------------------------------------------------------------------
# Next-step suggestion
# ---------------------------------------------------------------------------

# All registered tool names (mirrors CLI tool_map keys)
_ALL_TOOLS = [
    "nmap", "ffuf", "gobuster", "sqlmap", "nikto", "curl", "wfuzz",
    "burp", "jwt", "param_miner",
    "triage", "volatility", "pcap", "steghide", "zsteg", "lsb",
    "hexdump", "strings_grep", "foremost", "binwalk", "exiftool",
    "decoder", "rsa", "hashcrack", "xor", "vigenere", "aes",
    "checksec", "strings", "ghidra", "r2", "strace",
    "pwntools", "gdb", "ropgadget", "heap",
    "whois", "subfinder", "theharvester", "shodan", "wayback",
    "qr", "audio", "ltrace",
]

_TOOL_MAP = {
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
    "triage":       ("sentinel_ctf.tools.forensics.triage",        "TriageTool"),
    "volatility":   ("sentinel_ctf.tools.forensics.volatility",    "VolatilityTool"),
    "pcap":         ("sentinel_ctf.tools.forensics.pcap_tool",     "PcapTool"),
    "steghide":     ("sentinel_ctf.tools.forensics.steg.steghide_tool", "SteghideTool"),
    "zsteg":        ("sentinel_ctf.tools.forensics.steg.zsteg_tool",    "ZstegTool"),
    "lsb":          ("sentinel_ctf.tools.forensics.steg.lsb_tool",      "LsbTool"),
    "hexdump":      ("sentinel_ctf.tools.forensics.hexdump_tool",  "HexdumpTool"),
    "strings_grep": ("sentinel_ctf.tools.forensics.strings_grep",  "StringsGrepTool"),
    "foremost":     ("sentinel_ctf.tools.forensics.foremost_tool", "ForemostTool"),
    "binwalk":      ("sentinel_ctf.tools.misc.binwalk_tool",       "BinwalkTool"),
    "exiftool":     ("sentinel_ctf.tools.misc.exiftool_tool",      "ExiftoolTool"),
    "decoder":      ("sentinel_ctf.tools.crypto.decoder",      "DecoderTool"),
    "rsa":          ("sentinel_ctf.tools.crypto.rsa_tool",     "RsaTool"),
    "hashcrack":    ("sentinel_ctf.tools.crypto.hash_cracker", "HashCrackerTool"),
    "xor":          ("sentinel_ctf.tools.crypto.xor_tool",     "XorTool"),
    "vigenere":     ("sentinel_ctf.tools.crypto.vigenere_tool","VigenereTool"),
    "aes":          ("sentinel_ctf.tools.crypto.aes_tool",     "AesTool"),
    "checksec":     ("sentinel_ctf.tools.reversing.checksec",      "ChecksecTool"),
    "strings":      ("sentinel_ctf.tools.reversing.strings_tool",  "StringsTool"),
    "ghidra":       ("sentinel_ctf.tools.reversing.ghidra_tool",   "GhidraTool"),
    "r2":           ("sentinel_ctf.tools.reversing.radare2_tool",  "Radare2Tool"),
    "strace":       ("sentinel_ctf.tools.reversing.strace_tool",   "StraceTool"),
    "pwntools":     ("sentinel_ctf.tools.pwn.pwntools_runner",  "PwntoolsRunner"),
    "gdb":          ("sentinel_ctf.tools.pwn.gdb_tool",         "GdbTool"),
    "ropgadget":    ("sentinel_ctf.tools.pwn.rop_finder",       "RopFinderTool"),
    "heap":         ("sentinel_ctf.tools.pwn.heap_tool",        "HeapTool"),
    "whois":        ("sentinel_ctf.tools.osint.whois_tool",         "WhoisTool"),
    "subfinder":    ("sentinel_ctf.tools.osint.subfinder_tool",     "SubfinderTool"),
    "theharvester": ("sentinel_ctf.tools.osint.theharvester_tool",  "TheHarvesterTool"),
    "shodan":       ("sentinel_ctf.tools.osint.shodan_tool",        "ShodanTool"),
    "wayback":      ("sentinel_ctf.tools.osint.wayback_tool",       "WaybackTool"),
    "qr":           ("sentinel_ctf.tools.misc.qr_tool",    "QrTool"),
    "audio":        ("sentinel_ctf.tools.misc.audio_tool",  "AudioTool"),
    "ltrace":       ("sentinel_ctf.tools.misc.ltrace_tool", "LtraceTool"),
}


async def suggest_next_step(
    challenge: Challenge,
    findings: dict,
    history: list[str],
    playbook: str = "",
) -> dict:
    """Ask AI what tool to run next. Returns {tool, kwargs, reasoning}."""
    summary = build_triage_summary(findings)
    history_text = "\n".join(f"- {h}" for h in history) if history else "None yet"

    prompt = f"""CTF Challenge:
Name: {challenge.name}
Category: {challenge.category.value}
Target: {challenge.target_host or 'N/A'}:{challenge.target_port or 'N/A'}
Description: {challenge.description or 'N/A'}

Triage findings so far:
{summary}

Steps already taken:
{history_text}

Available tools: {', '.join(_ALL_TOOLS)}

What tool should I run next? Respond ONLY with valid JSON:
{{"tool": "tool_name", "kwargs": {{"key": "value"}}, "reasoning": "one sentence why"}}

If you think the flag is already in the findings, respond:
{{"tool": "flag_found", "kwargs": {{}}, "reasoning": "explain where the flag is"}}"""

    response = await ask_ai(prompt, model="sentinel-agent")

    # Extract JSON from response
    try:
        json_match = re.search(r"\{[^{}]+\}", response, re.S)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass

    return {"tool": "decoder", "kwargs": {}, "reasoning": "AI parse failed — fallback to decoder"}


# ---------------------------------------------------------------------------
# Tool runner
# ---------------------------------------------------------------------------

async def _run_tool(tool_name: str, executor: BaseExecutor, kwargs: dict) -> dict:
    """Dynamically import and run a tool. Returns parsed findings dict."""
    if tool_name not in _TOOL_MAP:
        return {"error": f"Unknown tool: {tool_name}"}
    module_path, class_name = _TOOL_MAP[tool_name]
    try:
        module = importlib.import_module(module_path)
        cls = getattr(module, class_name)
        tool = cls(executor)
        result = await tool.run(**kwargs)
        return result.parsed if result and result.parsed else {}
    except Exception as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Main auto-solve loop
# ---------------------------------------------------------------------------

async def run_auto_solve(
    challenge: Challenge,
    executor: BaseExecutor,
    file_path: str | None = None,
    max_iterations: int = 5,
    verbose: bool = True,
) -> dict:
    """
    AI-assisted auto-solve loop.

    Returns dict with:
      - flags_found: list of discovered flags
      - steps_taken: list of step descriptions
      - last_findings: final findings dict
    """
    from sentinel_ctf.workflows.triage import run_triage

    all_flags: list[str] = []
    steps: list[str] = []
    all_findings: dict = {}

    def vprint(msg: str, style: str = "") -> None:
        if verbose:
            if style:
                console.print(msg, style=style)
            else:
                console.print(msg)

    # ── Step 1: Initial triage ────────────────────────────────────────────
    vprint(f"\n[bold cyan]▶ Auto-solve: {challenge.name}[/bold cyan]")
    vprint("Running initial triage...", "dim")

    try:
        triage_result = await run_triage(challenge, executor, file_path=file_path)
        all_findings["triage"] = triage_result
        # Collect flags from triage
        triage_flags = scan_text(str(triage_result))
        all_flags.extend(triage_flags)
        steps.append(f"triage → {len(triage_flags)} flags found")
        if triage_flags:
            vprint(f"🚩 Flags from triage: {triage_flags}", "bold green")
    except Exception as exc:
        vprint(f"[yellow]Triage failed: {exc}[/yellow]")
        all_findings["triage"] = {}

    if all_flags:
        return {"flags_found": all_flags, "steps_taken": steps, "last_findings": all_findings}

    # ── Load playbook ─────────────────────────────────────────────────────
    playbook = await get_playbook(challenge.category)

    # ── Iteration loop ────────────────────────────────────────────────────
    for iteration in range(1, max_iterations + 1):
        vprint(f"\n[cyan]── Iteration {iteration}/{max_iterations} ──[/cyan]")

        suggestion = await suggest_next_step(challenge, all_findings, steps, playbook)
        tool_name = suggestion.get("tool", "")
        tool_kwargs = suggestion.get("kwargs", {})
        reasoning = suggestion.get("reasoning", "")

        vprint(f"[yellow]AI suggests: {tool_name}[/yellow]  ({reasoning})")

        # Flag found in AI analysis
        if tool_name == "flag_found":
            vprint(f"[bold green]AI found flag in existing data: {reasoning}[/bold green]")
            # Try to extract flag from reasoning
            found = re.findall(r"flag\{[^}]+\}", reasoning, re.I)
            all_flags.extend(found)
            steps.append(f"AI identified flag in findings")
            break

        if tool_name not in _TOOL_MAP:
            vprint(f"[red]Unknown tool '{tool_name}', skipping[/red]")
            steps.append(f"skipped unknown tool: {tool_name}")
            continue

        # Inject target info if not in kwargs
        if challenge.target_host and "target" not in tool_kwargs:
            tool_kwargs.setdefault("url", f"http://{challenge.target_host}:{challenge.target_port or 80}")
            tool_kwargs.setdefault("host", challenge.target_host)
        if file_path and "filepath" not in tool_kwargs:
            tool_kwargs.setdefault("filepath", file_path)

        # Run tool
        vprint(f"Running [bold]{tool_name}[/bold] with {tool_kwargs}...")
        try:
            findings = await _run_tool(tool_name, executor, tool_kwargs)
        except Exception as exc:
            vprint(f"[red]Tool error: {exc}[/red]")
            findings = {"error": str(exc)}

        all_findings[f"{tool_name}_{iteration}"] = findings
        step_desc = f"{tool_name}({tool_kwargs}) → "

        # Scan for flags
        found_flags = findings.get("flags_found", [])
        found_flags += scan_text(str(findings))
        found_flags = list(set(found_flags))

        if found_flags:
            vprint(f"[bold green]🚩 FLAG FOUND: {found_flags}[/bold green]")
            all_flags.extend(found_flags)
            step_desc += f"FLAG: {found_flags}"
            steps.append(step_desc)
            break
        else:
            vprint(f"[dim]No flag yet. Findings keys: {list(findings.keys())}[/dim]")
            step_desc += "no flag"
            steps.append(step_desc)

    if not all_flags:
        vprint("[red]Auto-solve exhausted iterations without finding a flag.[/red]")
        vprint("[dim]Hint: Review the findings manually or increase max_iterations[/dim]")

    return {
        "flags_found": list(set(all_flags)),
        "steps_taken": steps,
        "last_findings": all_findings,
    }
