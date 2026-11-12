"""
sentinel_ctf.tools.web.nikto
=============================
Nikto web server vulnerability scanner plugin.
"""
from __future__ import annotations

import re

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class NiktoTool(BaseTool):
    name = "nikto"
    description = "Web server vulnerability scanner"

    def build_command(
        self,
        host: str,
        port: int = 80,
        ssl: bool = False,
        extra_flags: str = "",
        **kwargs,
    ) -> str:
        safe_host = re.sub(r"[^a-z0-9]", "_", host.lower())[:20]
        parts = [
            "nikto",
            f"-h {host}",
            f"-p {port}",
        ]
        if ssl or port == 443:
            parts.append("-ssl")
        parts += [
            "-Format txt",
            f"-output /tmp/nikto_{safe_host}.txt",
        ]
        if extra_flags:
            parts.append(extra_flags)
        return " ".join(parts)

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        findings = [
            line.lstrip("+ ").strip()
            for line in out.splitlines()
            if line.strip().startswith("+") and len(line.strip()) > 2
        ]
        server_info = ""
        for line in out.splitlines():
            if "Server:" in line:
                server_info = line.strip()
                break
        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)
        return {
            "findings": findings,
            "total_findings": len(findings),
            "server_info": server_info,
            "flags_found": flags_found,
        }

    async def scan(self, host: str, **kwargs) -> JobResult:
        return await self.run(host=host, **kwargs)
