"""theHarvester email, subdomain, and host OSINT tool wrapper."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# Email address pattern
_EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')

# Hostname / subdomain pattern
_HOST_RE = re.compile(
    r'(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}'
)

# IPv4 address pattern
_IP_RE = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')

# theHarvester section markers
_SECTION_EMAIL_RE = re.compile(r'\[?\*\]?\s*Emails?\s*found', re.IGNORECASE)
_SECTION_HOST_RE = re.compile(r'\[?\*\]?\s*Hosts?\s*found', re.IGNORECASE)
_SECTION_IP_RE = re.compile(r'\[?\*\]?\s*IP\s*addresses?\s*found', re.IGNORECASE)


class TheHarvesterTool(BaseTool):
    """Email, subdomain, and host OSINT tool wrapping ``theHarvester``.

    ``theHarvester`` aggregates data from multiple public sources (search
    engines, PGP servers, WHOIS, Shodan, etc.) to discover email addresses,
    hostnames, and IP addresses associated with a domain.  This wrapper
    produces clean structured output from the verbose, multi-section
    theHarvester report format.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "theharvester"
    description: str = "Email, subdomain and host OSINT"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        domain: str,
        sources: str = "all",
        limit: int = 100,
        extra_flags: str = "",
    ) -> str:
        """Build the ``theHarvester`` shell command.

        Args:
            domain: Target domain (e.g. ``"example.com"``).
            sources: Comma-separated data source list (e.g. ``"google,bing"``).
                Defaults to ``"all"`` which enables all configured sources.
            limit: Maximum number of results to retrieve per source.
                Defaults to ``100``.
            extra_flags: Additional raw flags appended to the command
                (e.g. ``"-f /tmp/report"`` to save HTML/XML output).

        Returns:
            A shell command string that discards theHarvester's verbose
            banner/progress messages (stderr) and returns only the report.
        """
        parts = [
            "theHarvester",
            "-d", domain,
            "-b", sources,
            "-l", str(limit),
            extra_flags,
            "2>/dev/null",
        ]
        return " ".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse theHarvester output into structured OSINT findings.

        theHarvester prints its results under labelled sections such as
        ``[*] Emails found`` and ``[*] Hosts found``.  This parser scans
        for those section headers to provide context-sensitive extraction,
        but also performs a global regex sweep so that results not within
        a recognised section are still captured.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor after running theHarvester.

        Returns:
            A dictionary with the following keys:

            * ``emails`` (*list[str]*): Unique email addresses discovered.
            * ``hosts`` (*list[str]*): Unique hostnames / subdomains
              discovered.
            * ``ips`` (*list[str]*): Unique IPv4 addresses discovered.
            * ``flags_found`` (*list[str]*): CTF flag strings identified
              in the output.
            * ``raw_output`` (*str*): Raw verbatim theHarvester output.
        """
        output: str = result.stdout or ""

        emails: list[str] = []
        hosts: list[str] = []
        ips: list[str] = []
        flags_found: list[str] = []

        seen_emails: set[str] = set()
        seen_hosts: set[str] = set()
        seen_ips: set[str] = set()

        lines = output.splitlines()
        current_section: str | None = None

        for line in lines:
            line_s = line.strip()
            if not line_s:
                current_section = None
                continue

            # Detect section changes
            if _SECTION_EMAIL_RE.search(line_s):
                current_section = "email"
                continue
            if _SECTION_HOST_RE.search(line_s):
                current_section = "host"
                continue
            if _SECTION_IP_RE.search(line_s):
                current_section = "ip"
                continue
            if line_s.startswith("[") or line_s.startswith("---") or line_s.startswith("==="):
                current_section = None

            # Section-aware extraction
            if current_section == "email":
                for e in _EMAIL_RE.findall(line_s):
                    if e.lower() not in seen_emails:
                        seen_emails.add(e.lower())
                        emails.append(e)
            elif current_section == "host":
                for h in _HOST_RE.findall(line_s):
                    if h.lower() not in seen_hosts:
                        seen_hosts.add(h.lower())
                        hosts.append(h)
            elif current_section == "ip":
                for ip in _IP_RE.findall(line_s):
                    if ip not in seen_ips:
                        seen_ips.add(ip)
                        ips.append(ip)

        # Global fallback sweep for anything missed by section detection
        for e in _EMAIL_RE.findall(output):
            if e.lower() not in seen_emails:
                seen_emails.add(e.lower())
                emails.append(e)

        for ip in _IP_RE.findall(output):
            # Exclude IPs that are too common / private ranges only if desired
            if ip not in seen_ips:
                seen_ips.add(ip)
                ips.append(ip)

        # Flag scan
        flags_found.extend(_FLAG_PATTERN.findall(output))

        seen_flags: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen_flags:
                seen_flags.add(flag)
                unique_flags.append(flag)

        return {
            "emails": emails,
            "hosts": hosts,
            "ips": ips,
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def harvest(self, domain: str, **kwargs: Any) -> JobResult:
        """Run theHarvester and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` in a single awaitable call.

        Args:
            domain: Target domain to harvest OSINT data for.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``sources``, ``limit``, ``extra_flags``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed OSINT harvest dictionary.
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
