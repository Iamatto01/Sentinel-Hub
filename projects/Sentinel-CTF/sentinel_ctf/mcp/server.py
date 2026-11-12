"""
sentinel_ctf.mcp.server
========================
MCP server exposing the Sentinel CTF Framework to AI agents (Antigravity, etc.).

Start with:
    python -m sentinel_ctf.mcp.server

The agent can then call tools like:
    ctf_list_challenges
    ctf_new_challenge
    ctf_triage
    ctf_run_tool
    ctf_solve
    ctf_get_jobs
    ctf_ssh_run (run arbitrary command on Kali — restricted to ctf root)
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types as mcp_types

from sentinel_ctf.core.config import config
from sentinel_ctf.core.database import (
    init_db, save_challenge, get_challenge, list_challenges, list_jobs, save_job
)
from sentinel_ctf.core.models import (
    Category, Challenge, ChallengeStatus, Difficulty, Job
)
from sentinel_ctf.core.workspace import create_workspace
from sentinel_ctf.core.flagfinder import scan_text

init_db()

server = Server("sentinel-ctf")


# ---------------------------------------------------------------------------
# Tool: list_challenges
# ---------------------------------------------------------------------------

@server.list_tools()
async def handle_list_tools() -> list[mcp_types.Tool]:
    return [
        mcp_types.Tool(
            name="ctf_list_challenges",
            description="List all CTF challenges. Optionally filter by category or status.",
            inputSchema={
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "web|forensics|crypto|reversing|pwn|osint|misc"},
                    "status": {"type": "string", "description": "new|in_progress|solved|stuck|skipped"},
                },
            },
        ),
        mcp_types.Tool(
            name="ctf_new_challenge",
            description="Create a new challenge workspace and register it in the database.",
            inputSchema={
                "type": "object",
                "required": ["name", "category"],
                "properties": {
                    "name": {"type": "string"},
                    "category": {"type": "string"},
                    "difficulty": {"type": "string", "default": "medium"},
                    "platform": {"type": "string", "default": ""},
                    "event": {"type": "string", "default": ""},
                    "target_host": {"type": "string"},
                    "target_port": {"type": "integer"},
                    "description": {"type": "string"},
                    "flag_format": {"type": "string"},
                },
            },
        ),
        mcp_types.Tool(
            name="ctf_get_challenge",
            description="Get full details for a specific challenge by ID.",
            inputSchema={
                "type": "object",
                "required": ["challenge_id"],
                "properties": {"challenge_id": {"type": "string"}},
            },
        ),
        mcp_types.Tool(
            name="ctf_triage",
            description="Run the automated triage workflow for a challenge on the Kali VM.",
            inputSchema={
                "type": "object",
                "required": ["challenge_id"],
                "properties": {
                    "challenge_id": {"type": "string"},
                    "file_path": {"type": "string", "description": "Remote path on Kali to triage"},
                },
            },
        ),
        mcp_types.Tool(
            name="ctf_run_tool",
            description="Run a specific tool on the Kali VM for a challenge.",
            inputSchema={
                "type": "object",
                "required": ["challenge_id", "tool"],
                "properties": {
                    "challenge_id": {"type": "string"},
                    "tool": {"type": "string", "description": "nmap|ffuf|gobuster|triage|checksec|strings|whois|volatility|decoder"},
                    "target": {"type": "string"},
                    "file_path": {"type": "string"},
                    "extra_flags": {"type": "string"},
                    "timeout": {"type": "number", "default": 300},
                },
            },
        ),
        mcp_types.Tool(
            name="ctf_solve",
            description="Mark a challenge as solved with the discovered flag.",
            inputSchema={
                "type": "object",
                "required": ["challenge_id", "flag"],
                "properties": {
                    "challenge_id": {"type": "string"},
                    "flag": {"type": "string"},
                },
            },
        ),
        mcp_types.Tool(
            name="ctf_get_jobs",
            description="Get all tool jobs run for a challenge.",
            inputSchema={
                "type": "object",
                "required": ["challenge_id"],
                "properties": {"challenge_id": {"type": "string"}},
            },
        ),
        mcp_types.Tool(
            name="ctf_ssh_run",
            description="Run an arbitrary command on the Kali VM. Restricted to the CTF challenge directory.",
            inputSchema={
                "type": "object",
                "required": ["command"],
                "properties": {
                    "command": {"type": "string"},
                    "cwd": {"type": "string", "description": "Working directory on Kali"},
                    "timeout": {"type": "number", "default": 60},
                },
            },
        ),
        mcp_types.Tool(
            name="ctf_flag_scan",
            description="Scan arbitrary text for flag patterns.",
            inputSchema={
                "type": "object",
                "required": ["text"],
                "properties": {
                    "text": {"type": "string"},
                    "flag_regex": {"type": "string"},
                },
            },
        ),
    ]


# ---------------------------------------------------------------------------
# Tool call dispatcher
# ---------------------------------------------------------------------------

@server.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any]) -> list[mcp_types.TextContent]:
    try:
        result = await _dispatch(name, arguments)
        return [mcp_types.TextContent(type="text", text=json.dumps(result, default=str, indent=2))]
    except Exception as e:
        return [mcp_types.TextContent(type="text", text=json.dumps({"error": str(e)}))]


async def _dispatch(name: str, args: dict[str, Any]) -> Any:
    if name == "ctf_list_challenges":
        category = Category(args["category"]) if args.get("category") else None
        status = ChallengeStatus(args["status"]) if args.get("status") else None
        challenges = list_challenges(category=category, status=status)
        return [
            {
                "id": ch.id,
                "name": ch.name,
                "category": ch.category.value,
                "status": ch.status.value,
                "flag": ch.flag,
                "difficulty": ch.difficulty.value,
                "platform": ch.platform,
            }
            for ch in challenges
        ]

    elif name == "ctf_new_challenge":
        ch = Challenge(
            name=args["name"],
            category=Category(args["category"]),
            difficulty=Difficulty(args.get("difficulty", "medium")),
            platform=args.get("platform", ""),
            event=args.get("event", ""),
            target_host=args.get("target_host"),
            target_port=args.get("target_port"),
            description=args.get("description", ""),
            flag_format=args.get("flag_format", config.DEFAULT_FLAG_REGEX),
        )
        ch.mark_in_progress()
        create_workspace(ch)
        save_challenge(ch)
        return {"id": ch.id, "name": ch.name, "workspace": str(ch.workspace_dir)}

    elif name == "ctf_get_challenge":
        ch = get_challenge(args["challenge_id"])
        if not ch:
            return {"error": "Challenge not found"}
        return ch.model_dump(mode="json")

    elif name == "ctf_triage":
        ch = get_challenge(args["challenge_id"])
        if not ch:
            return {"error": "Challenge not found"}
        from sentinel_ctf.executor.ssh import KaliSSHExecutor
        from sentinel_ctf.workflows.triage import run_triage
        async with KaliSSHExecutor() as ex:
            findings = await run_triage(ch, ex, file_path=args.get("file_path"))
        return findings

    elif name == "ctf_run_tool":
        ch = get_challenge(args["challenge_id"])
        if not ch:
            return {"error": "Challenge not found"}
        from sentinel_ctf.executor.ssh import KaliSSHExecutor
        tool_name = args["tool"]
        tool_kwargs: dict[str, Any] = {}
        if args.get("target"):
            tool_kwargs["target"] = args["target"]
        if args.get("file_path"):
            tool_kwargs["filepath"] = args["file_path"]
        if args.get("extra_flags"):
            tool_kwargs["extra_flags"] = args["extra_flags"]
        timeout = args.get("timeout", 300)

        import importlib
        tool_map = {
            "nmap": ("sentinel_ctf.tools.web.nmap", "NmapTool"),
            "ffuf": ("sentinel_ctf.tools.web.ffuf", "FfufTool"),
            "gobuster": ("sentinel_ctf.tools.web.gobuster", "GobusterTool"),
            "triage": ("sentinel_ctf.tools.forensics.triage", "TriageTool"),
            "checksec": ("sentinel_ctf.tools.reversing.checksec", "ChecksecTool"),
            "strings": ("sentinel_ctf.tools.reversing.strings_tool", "StringsTool"),
            "whois": ("sentinel_ctf.tools.osint.whois_tool", "WhoisTool"),
            "volatility": ("sentinel_ctf.tools.forensics.volatility", "VolatilityTool"),
            "decoder": ("sentinel_ctf.tools.crypto.decoder", "DecoderTool"),
        }
        if tool_name not in tool_map:
            return {"error": f"Unknown tool: {tool_name}"}

        module_path, class_name = tool_map[tool_name]
        module = importlib.import_module(module_path)
        ToolClass = getattr(module, class_name)

        async with KaliSSHExecutor() as ex:
            tool_instance = ToolClass(ex)
            result = await tool_instance.run(timeout=timeout, **tool_kwargs)
            job = Job(challenge_id=ch.id, tool=tool_name, command=tool_instance.build_command(**tool_kwargs))
            job.complete(result)
            save_job(job)

        return {
            "stdout": result.stdout[:5000],
            "stderr": result.stderr[:1000],
            "return_code": result.return_code,
            "duration_s": result.duration_s,
            "parsed": result.parsed,
            "flags_found": result.flags_found,
        }

    elif name == "ctf_solve":
        ch = get_challenge(args["challenge_id"])
        if not ch:
            return {"error": "Challenge not found"}
        ch.mark_solved(args["flag"])
        save_challenge(ch)
        return {"status": "solved", "flag": args["flag"]}

    elif name == "ctf_get_jobs":
        jobs = list_jobs(args["challenge_id"])
        return [
            {
                "id": j.id,
                "tool": j.tool,
                "command": j.command,
                "status": j.status.value,
                "flags_found": j.result.flags_found if j.result else [],
                "duration_s": j.result.duration_s if j.result else 0,
            }
            for j in jobs
        ]

    elif name == "ctf_ssh_run":
        command = args["command"]
        cwd = args.get("cwd", config.KALI_CHALLENGE_ROOT)
        timeout = args.get("timeout", 60)
        from sentinel_ctf.executor.ssh import KaliSSHExecutor
        async with KaliSSHExecutor() as ex:
            result = await ex.run(command, cwd=cwd, timeout=timeout)
        return {
            "stdout": result.stdout[:5000],
            "stderr": result.stderr[:1000],
            "return_code": result.return_code,
            "duration_s": result.duration_s,
        }

    elif name == "ctf_flag_scan":
        flags = scan_text(args["text"], args.get("flag_regex"))
        return {"flags_found": flags}

    return {"error": f"Unknown tool: {name}"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main():
    async with stdio_server() as streams:
        await server.run(
            streams[0],
            streams[1],
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
