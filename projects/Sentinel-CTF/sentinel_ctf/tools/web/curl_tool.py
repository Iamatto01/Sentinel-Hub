"""
sentinel_ctf.tools.web.curl_tool
=================================
curl HTTP request tool plugin — custom headers, methods, cookies, body.
"""
from __future__ import annotations

import re
import json

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class CurlTool(BaseTool):
    name = "curl"
    description = "HTTP request tool with custom headers, body, method, cookies"

    def build_command(
        self,
        url: str,
        method: str = "GET",
        data: str = "",
        headers: dict | None = None,
        cookies: str = "",
        follow_redirects: bool = True,
        verbose: bool = False,
        include_headers: bool = True,
        timeout: int = 30,
        extra_flags: str = "",
        **kwargs,
    ) -> str:
        parts = ["curl", "-s"]
        if include_headers:
            parts.append("-D -")          # dump headers to stdout
        if verbose:
            parts.append("-v")
        if follow_redirects:
            parts.append("-L")
        parts.append(f"-X {method.upper()}")
        if data:
            parts.append(f"-d {data!r}")
        if headers:
            for k, v in headers.items():
                parts.append(f"-H {(k + ': ' + v)!r}")
        if cookies:
            parts.append(f"-b {cookies!r}")
        parts.append(f"--max-time {timeout}")
        if extra_flags:
            parts.append(extra_flags)
        parts.append(f"{url!r}")
        return " ".join(parts)

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""

        # Extract status code
        status_match = re.search(r"HTTP/[\d.]+ (\d{3})", out)
        status_code = int(status_match.group(1)) if status_match else 0

        # Split headers and body on blank line
        response_headers: dict[str, str] = {}
        body = out
        if "\r\n\r\n" in out:
            header_part, body = out.split("\r\n\r\n", 1)
        elif "\n\n" in out:
            header_part, body = out.split("\n\n", 1)
        else:
            header_part = ""

        for line in header_part.splitlines():
            if ":" in line and not line.startswith("HTTP"):
                k, _, v = line.partition(":")
                response_headers[k.strip().lower()] = v.strip()

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)

        return {
            "status_code": status_code,
            "response_headers": response_headers,
            "body_snippet": body[:3000],
            "flags_found": flags_found,
        }

    async def request(self, url: str, **kwargs) -> JobResult:
        return await self.run(url=url, **kwargs)
