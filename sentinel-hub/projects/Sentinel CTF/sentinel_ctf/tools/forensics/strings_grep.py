"""
sentinel_ctf.tools.forensics.strings_grep
==========================================
Targeted string extraction with regex patterns.
"""
from __future__ import annotations

import re
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

_DEFAULT_PATTERNS = [
    r"flag\{", r"CTF\{", r"password", r"passwd", r"secret", r"key",
    r"token", r"api_key", r"auth", r"admin", r"root", r"http[s]?://",
    r"[A-Za-z0-9+/]{40,}={0,2}",  # base64-ish
    r"[0-9a-f]{32,}",              # hex strings
]


class StringsGrepTool(BaseTool):
    name = "strings_grep"
    description = "Targeted string extraction with regex patterns"

    def build_command(self, filepath: str, patterns: list[str] | None = None,
                      min_length: int = 4, **kwargs) -> str:
        pattern_str = "|".join(patterns) if patterns else "|".join(_DEFAULT_PATTERNS)
        return f"strings -a -n {min_length} {filepath} | grep -iE {pattern_str!r} 2>/dev/null"

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        matches = [line for line in out.splitlines() if line.strip()]
        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)

        # Group by which default pattern matched
        grouped: dict[str, list[str]] = {}
        for line in matches:
            for p in _DEFAULT_PATTERNS:
                if re.search(p, line, re.I):
                    grouped.setdefault(p, []).append(line)

        return {
            "matches": matches,
            "total": len(matches),
            "grouped": grouped,
            "flags_found": flags_found,
        }

    async def search(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
