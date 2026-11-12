"""
sentinel_ctf.tools.web.sqlmap
==============================
SQLMap tool plugin — automated SQL injection detection and exploitation.
"""
from __future__ import annotations

import re

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class SqlmapTool(BaseTool):
    name = "sqlmap"
    description = "Automated SQL injection detection and exploitation"

    def build_command(
        self,
        url: str,
        data: str = "",
        cookie: str = "",
        level: int = 1,
        risk: int = 1,
        dbms: str = "",
        dump: bool = False,
        tables: bool = False,
        dbs: bool = False,
        extra_flags: str = "",
        **kwargs,
    ) -> str:
        safe_url = re.sub(r"[^a-z0-9]", "_", url.lower())[:20]
        parts = [
            f"sqlmap -u {url!r}",
            f"--level={level}",
            f"--risk={risk}",
            "--batch",
            "--no-logging",
            f"--output-dir=/tmp/sqlmap_{safe_url}",
        ]
        if data:
            parts.append(f"--data={data!r}")
        if cookie:
            parts.append(f"--cookie={cookie!r}")
        if dbms:
            parts.append(f"--dbms={dbms}")
        if dbs:
            parts.append("--dbs")
        if tables:
            parts.append("--tables")
        if dump:
            parts.append("--dump")
        if extra_flags:
            parts.append(extra_flags)
        return " ".join(parts)

    def parse(self, result: ExecResult) -> dict:
        out = (result.stdout or "") + (result.stderr or "")

        # Injectable parameters
        injectable = re.findall(
            r"Parameter:\s+(\S+)\s+\((.+?)\)\s+is\s+(?:injectable|vulnerable)", out
        )
        injectable_params = [f"{p} ({t})" for p, t in injectable]
        # Also simpler pattern
        if not injectable_params:
            injectable_params = re.findall(r"(?:parameter|param)\s+'([^']+)'\s+is\s+(?:injectable|vulnerable)", out, re.I)

        databases = re.findall(r"\[\*\]\s+(\S+)\s*$", out, re.M)
        tables = re.findall(r"\|\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+\|", out)
        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)

        return {
            "injectable_params": injectable_params,
            "databases": list(set(databases)),
            "tables": list(set(tables)),
            "flags_found": flags_found,
            "raw_snippet": out[:2000],
        }

    async def scan(self, url: str, **kwargs) -> JobResult:
        return await self.run(url=url, **kwargs)
