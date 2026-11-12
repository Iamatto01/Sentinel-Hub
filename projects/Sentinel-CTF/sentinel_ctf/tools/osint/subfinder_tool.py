"""Subfinder subdomain enumeration tool for CTF OSINT challenges."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# Rough validation for a hostname / subdomain line
_HOSTNAME_RE = re.compile(
    r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
)


class SubfinderTool(BaseTool):
    """Subdomain enumeration tool wrapping ``subfinder``.

    ``subfinder`` queries passive DNS sources to discover subdomains for a
    given domain.  This wrapper runs it in silent mode (``-silent``) so that
    only subdomains are written to stdout, making parsing straightforward.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "subfinder"
    description: str = "Subdomain enumeration"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        domain: str,
        sources: str = "",
        timeout: int = 30,
        extra_flags: str = "",
    ) -> str:
        """Build the ``subfinder`` shell command.

        Args:
            domain: The target domain to enumerate (e.g. ``"example.com"``).
            sources: Comma-separated list of passive sources to restrict
                querying to (e.g. ``"shodan,censys"``).  An empty string
                enables all default sources.
            timeout: Per-source timeout in seconds.  Defaults to ``30``.
            extra_flags: Additional raw flags appended to the command
                (e.g. ``"-oJ /tmp/out.json"``).

        Returns:
            A shell command string that suppresses diagnostic output and
            emits only the discovered subdomains to stdout.
        """
        sources_flag = f"-sources {sources}" if sources else ""
        parts = [
            "subfinder",
            "-d", domain,
            sources_flag,
            f"-timeout {timeout}",
            extra_flags,
            "-silent",
            "2>/dev/null",
        ]
        return " ".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse subfinder output into a structured subdomain list.

        Each non-empty line of output is validated as a hostname and added
        to the ``subdomains`` list.  The total count is also computed, and
        the entire output is scanned for CTF flag patterns (unlikely but
        possible in CTF environments).

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor.

        Returns:
            A dictionary with the following keys:

            * ``subdomains`` (*list[str]*): Unique subdomain strings, one
              per line, with blank and malformed lines omitted.
            * ``total`` (*int*): Count of unique discovered subdomains.
            * ``flags_found`` (*list[str]*): CTF flag strings found in the
              output (typically empty for OSINT tools but included for
              consistency).
            * ``raw_output`` (*str*): Raw verbatim subfinder output.
        """
        output: str = result.stdout or ""
        subdomains: list[str] = []
        flags_found: list[str] = []

        seen_subs: set[str] = set()
        for line in output.splitlines():
            subdomain = line.strip().lower()
            if not subdomain:
                continue
            if _HOSTNAME_RE.match(subdomain) and subdomain not in seen_subs:
                seen_subs.add(subdomain)
                subdomains.append(subdomain)

        flags_found.extend(_FLAG_PATTERN.findall(output))

        seen_flags: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen_flags:
                seen_flags.add(flag)
                unique_flags.append(flag)

        return {
            "subdomains": subdomains,
            "total": len(subdomains),
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def enumerate(self, domain: str, **kwargs: Any) -> JobResult:
        """Run subfinder enumeration and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` in a single awaitable call.

        Args:
            domain: Target domain to enumerate subdomains for.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``sources``, ``timeout``, ``extra_flags``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed subdomain enumeration dictionary.
        """
        command = self.build_command(domain, **kwargs)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
