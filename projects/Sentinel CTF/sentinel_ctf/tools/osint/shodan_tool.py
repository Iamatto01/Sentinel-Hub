"""
sentinel_ctf.tools.osint.shodan_tool
======================================
Shodan host/search lookup plugin.

Uses the ``shodan`` CLI when available, falling back to direct Shodan API
calls via ``curl`` for host lookups and search queries.
"""
from __future__ import annotations

import json
import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)

_CVE_RE = re.compile(r"CVE-\d{4}-\d{4,7}", re.IGNORECASE)
_PORT_RE = re.compile(r"Port\s+(\d+)", re.IGNORECASE)


class ShodanTool(BaseTool):
    """
    Queries Shodan for open ports, services, banners, and CVEs.

    Uses the ``shodan`` CLI tool (``shodan host`` / ``shodan search``) with
    an automatic fallback to Shodan's public REST API via ``curl``.
    """

    name: str = "shodan"
    description: str = "Shodan host/search lookup via CLI or API"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        target: str,
        search_type: str = "host",
        query: str = "",
        api_key: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build the Shodan CLI/API command.

        Parameters
        ----------
        target:
            IP address or hostname (used for ``search_type='host'``).
        search_type:
            ``'host'`` for a single IP lookup; ``'search'`` for a Shodan
            dork/query.
        query:
            Shodan search query string (used when ``search_type='search'``).
        api_key:
            Shodan API key for the curl fallback.

        Returns
        -------
        str
            Shell command string.
        """
        if search_type == "host":
            cli_cmd = f"shodan host {target} 2>/dev/null"
            api_url = (
                f"https://api.shodan.io/shodan/host/{target}?key={api_key}"
            )
            curl_cmd = f"curl -s '{api_url}'"
            return f"({cli_cmd}) || ({curl_cmd})"

        # search_type == 'search'
        safe_query = query.replace("'", "\\'")
        cli_cmd = f"shodan search '{safe_query}' 2>/dev/null"
        api_url = (
            f"https://api.shodan.io/shodan/host/search"
            f"?key={api_key}&query={safe_query}"
        )
        curl_cmd = f"curl -s '{api_url}'"
        return f"({cli_cmd}) || ({curl_cmd})"

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse Shodan CLI or API JSON output.

        Returns
        -------
        dict with keys:

        * ``ip`` – target IP string
        * ``ports`` – list of open port ints
        * ``services`` – list of ``{port, service, banner}``
        * ``country`` – country name / code
        * ``org`` – organisation string
        * ``hostnames`` – list of hostnames
        * ``vulns`` – list of CVE strings
        * ``flags_found`` – CTF flags in output
        """
        stdout = result.stdout or ""
        flags_found: list[str] = []
        ip = ""
        ports: list[int] = []
        services: list[dict[str, Any]] = []
        country = ""
        org = ""
        hostnames: list[str] = []
        vulns: list[str] = []

        # Flags
        for flag_m in _FLAG_RE.finditer(stdout):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        # Try JSON (Shodan API response)
        try:
            data = json.loads(stdout)

            ip = data.get("ip_str", data.get("ip", ""))
            org = data.get("org", "")
            country = (
                data.get("country_name", "")
                or data.get("country_code", "")
            )
            hostnames = data.get("hostnames", [])
            vulns = list(data.get("vulns", {}).keys())

            for item in data.get("data", []):
                port = item.get("port", 0)
                service = item.get("_shodan", {}).get("module", "") or item.get("transport", "")
                banner = (item.get("data", "") or "").strip()[:200]
                if port and port not in ports:
                    ports.append(int(port))
                services.append({"port": int(port), "service": service, "banner": banner})

            # Fallback: top-level ports list
            if not ports:
                ports = [int(p) for p in data.get("ports", [])]

        except (json.JSONDecodeError, TypeError):
            # Parse plain-text CLI output
            for line in stdout.splitlines():
                # IP line
                if line.startswith("IP:") or line.lower().startswith("ip address"):
                    ip = line.split(":", 1)[-1].strip()
                elif line.lower().startswith("country"):
                    country = line.split(":", 1)[-1].strip()
                elif line.lower().startswith("org"):
                    org = line.split(":", 1)[-1].strip()
                elif line.lower().startswith("hostname"):
                    for h in line.split(":", 1)[-1].split(","):
                        h = h.strip()
                        if h:
                            hostnames.append(h)

                # Port lines
                for pm in _PORT_RE.finditer(line):
                    pval = int(pm.group(1))
                    if pval not in ports:
                        ports.append(pval)

                # CVE lines
                for cve_m in _CVE_RE.finditer(line):
                    cve = cve_m.group(0).upper()
                    if cve not in vulns:
                        vulns.append(cve)

        return {
            "ip": ip,
            "ports": sorted(ports),
            "services": services,
            "country": country,
            "org": org,
            "hostnames": hostnames,
            "vulns": vulns,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def lookup(self, target: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        target:
            IP address or hostname to look up.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(target=target, **kwargs)
