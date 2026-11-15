"""
sentinel_ctf.tools.web.burp_repeater
=====================================
Burp Repeater equivalent: replay raw HTTP request strings via ``curl``.

Given a raw HTTP request (copy-pasted from Burp Suite / Wireshark), this
plugin parses the request and reconstructs an equivalent ``curl`` command
that re-sends it to the target host.
"""
from __future__ import annotations

import re
import shlex
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)

_STATUS_LINE_RE = re.compile(r"^HTTP/[\d.]+ (\d+)")


def _parse_raw_request(raw: str) -> tuple[str, str, dict[str, str], str]:
    """
    Parse a raw HTTP/1.x request string.

    Returns
    -------
    (method, path, headers, body)
    """
    # Normalise line endings
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")

    # Split head from body on first blank line
    if "\n\n" in raw:
        head_section, body = raw.split("\n\n", 1)
    else:
        head_section, body = raw, ""

    lines = head_section.splitlines()
    if not lines:
        return "GET", "/", {}, ""

    # Request line
    request_line = lines[0].strip()
    parts = request_line.split()
    method = parts[0].upper() if len(parts) >= 1 else "GET"
    path = parts[1] if len(parts) >= 2 else "/"

    # Headers
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            key, _, value = line.partition(":")
            headers[key.strip()] = value.strip()

    return method, path, headers, body.rstrip("\n")


class BurpRepeaterTool(BaseTool):
    """
    Replays a raw HTTP request string using ``curl``.

    This is functionally equivalent to pasting a request into Burp Repeater
    and hitting *Send*.  The raw request is parsed and re-constructed as a
    ``curl`` invocation that preserves method, path, all headers, and body.
    """

    name: str = "burp_repeater"
    description: str = "Replay raw HTTP requests via curl (Burp Repeater equivalent)"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        raw_request: str,
        host: str,
        port: int = 80,
        ssl: bool = False,
        extra_flags: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build a ``curl`` command that faithfully replays *raw_request*.

        Parameters
        ----------
        raw_request:
            The raw HTTP/1.x request text (headers + optional body).
        host:
            Target hostname or IP address.
        port:
            TCP port (default 80).
        ssl:
            If ``True``, use HTTPS and pass ``-k`` to skip cert validation.
        extra_flags:
            Additional raw curl flags appended verbatim.

        Returns
        -------
        str
            Ready-to-execute shell command.
        """
        method, path, headers, body = _parse_raw_request(raw_request)

        scheme = "https" if ssl else "http"
        base_url = f"{scheme}://{host}:{port}{path}"

        parts: list[str] = ["curl", "-s", "-D", "-", "-X", method]

        if ssl:
            parts.append("-k")

        for key, value in headers.items():
            # Skip Host — we're setting it via the URL
            if key.lower() == "host":
                continue
            parts += ["-H", shlex.quote(f"{key}: {value}")]

        if body:
            parts += ["-d", shlex.quote(body)]

        parts.append(shlex.quote(base_url))

        if extra_flags:
            parts.append(extra_flags)

        return " ".join(parts)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse curl ``-D -`` output (headers dumped to stdout, then body).

        Returns
        -------
        dict with keys:

        * ``status_code`` – int HTTP status
        * ``response_headers`` – dict of header name → value
        * ``body`` – response body string
        * ``flags_found`` – any CTF flag strings in the response
        """
        stdout = result.stdout or ""
        flags_found: list[str] = []
        status_code: int = 0
        response_headers: dict[str, str] = {}
        body = ""

        # Split on double blank line (separator between headers and body)
        if "\r\n\r\n" in stdout:
            header_block, body = stdout.split("\r\n\r\n", 1)
            header_lines = header_block.splitlines()
        elif "\n\n" in stdout:
            header_block, body = stdout.split("\n\n", 1)
            header_lines = header_block.splitlines()
        else:
            header_lines = stdout.splitlines()

        for line in header_lines:
            m = _STATUS_LINE_RE.match(line.strip())
            if m:
                status_code = int(m.group(1))
                continue
            if ":" in line:
                key, _, value = line.partition(":")
                response_headers[key.strip()] = value.strip()

        # Scan full output for flags
        for flag_m in _FLAG_RE.finditer(stdout):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        return {
            "status_code": status_code,
            "response_headers": response_headers,
            "body": body,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def replay(self, raw_request: str, host: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        raw_request:
            Raw HTTP request text.
        host:
            Target host.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(raw_request=raw_request, host=host, **kwargs)
