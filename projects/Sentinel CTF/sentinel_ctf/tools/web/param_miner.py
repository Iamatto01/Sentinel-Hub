"""
sentinel_ctf.tools.web.param_miner
====================================
Hidden HTTP parameter discovery plugin powered by ``ffuf``.

Probes a target URL by appending each word from a wordlist as a query
parameter (``?FUZZ=sentinel_test``) and records responses that deviate
from the baseline.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)

_TMP_OUTPUT = "/tmp/param_miner_out.json"


class ParamMinerTool(BaseTool):
    """
    Discovers hidden HTTP parameters by fuzzing with ``ffuf``.

    The tool writes JSON output to ``/tmp/param_miner_out.json`` and
    reads it back during :meth:`parse` for structured extraction.
    """

    name: str = "param_miner"
    description: str = "Hidden parameter discovery via wordlist probing"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        url: str,
        method: str = "GET",
        wordlist: str = "/usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt",
        threads: int = 50,
        **kwargs: Any,
    ) -> str:
        """
        Build the ``ffuf`` command for parameter discovery.

        Parameters
        ----------
        url:
            Base URL to probe (must not already contain a query string with
            ``FUZZ`` — the keyword is appended automatically).
        method:
            HTTP method to use (``GET`` or ``POST``).  Currently the fuzzing
            target is always in the query string.
        wordlist:
            Path to the parameter name wordlist.
        threads:
            Number of concurrent ffuf threads.

        Returns
        -------
        str
            Shell command string.
        """
        fuzz_url = url.rstrip("/")
        if "?" in fuzz_url:
            fuzz_url += "&FUZZ=sentinel_test"
        else:
            fuzz_url += "?FUZZ=sentinel_test"

        cmd = (
            f"ffuf -w {wordlist} "
            f"-u '{fuzz_url}' "
            f"-mc 200,301,302,400,403,500 "
            f"-t {threads} "
            f"-of json -o {_TMP_OUTPUT} "
            f"-s 2>/dev/null"
        )
        return cmd

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse the ffuf JSON output file for discovered parameters.

        Returns
        -------
        dict with keys:

        * ``found_params`` – list of ``{param, status, size}``
        * ``flags_found`` – any CTF flags seen in stdout/stderr
        """
        found_params: list[dict[str, Any]] = []
        flags_found: list[str] = []

        # Scan raw output for flags
        combined = (result.stdout or "") + "\n" + (result.stderr or "")
        for flag_m in _FLAG_RE.finditer(combined):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        # Parse the JSON output file written by ffuf
        try:
            with open(_TMP_OUTPUT, "r", encoding="utf-8", errors="replace") as fh:
                data = json.load(fh)

            results_list = data.get("results", [])
            for entry in results_list:
                param = entry.get("input", {}).get("FUZZ", "")
                # ffuf JSON uses 'status' and 'length'
                status = entry.get("status", 0)
                size = entry.get("length", 0)
                if param:
                    found_params.append(
                        {"param": param, "status": int(status), "size": int(size)}
                    )

                # Scan result for flags
                result_str = entry.get("results", entry.get("url", ""))
                for flag_m in _FLAG_RE.finditer(str(result_str)):
                    flag = flag_m.group(0)
                    if flag not in flags_found:
                        flags_found.append(flag)

        except FileNotFoundError:
            # ffuf may not have written the file if no results were found
            pass
        except json.JSONDecodeError:
            # Corrupt output file — non-fatal
            pass

        return {
            "found_params": found_params,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def mine(self, url: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        url:
            Target URL to probe.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(url=url, **kwargs)
