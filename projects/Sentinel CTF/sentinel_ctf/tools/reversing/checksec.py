"""checksec.py — Binary protection checker wrapping the ``checksec`` utility.

Supports both the modern JSON output format (``--output=json``) and the
legacy coloured/plain-text format produced by older ``checksec`` versions.
The parsed result is always normalised to a consistent dict schema.
"""

from __future__ import annotations

import json
import re
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# ---------------------------------------------------------------------------
# Default flag regex
# ---------------------------------------------------------------------------
_FLAG_RE = re.compile(r'flag\{[^}]+\}', re.IGNORECASE)

# ---------------------------------------------------------------------------
# Text-mode normalisation helpers
# ---------------------------------------------------------------------------
_RELRO_RE = re.compile(r'(Full|Partial|No)\s+RELRO', re.IGNORECASE)
_ARCH_RE = re.compile(r'\b(x86_64|x86|aarch64|arm|mips(?:el)?|ppc(?:64)?|riscv(?:64)?)\b', re.IGNORECASE)
_BITS_RE = re.compile(r'\b(32|64)\s*(?:-bit|bit)\b', re.IGNORECASE)


def _bool_from_text(haystack: str, keyword: str) -> bool:
    """Return True when *keyword* appears without a leading 'No ' in *haystack*."""
    pattern = re.compile(
        r'(?<!No\s)(?<!no\s)\b' + re.escape(keyword) + r'\b',
        re.IGNORECASE,
    )
    return bool(pattern.search(haystack))


# ---------------------------------------------------------------------------
# Main tool class
# ---------------------------------------------------------------------------

class ChecksecTool(BaseTool):
    """Check binary protections using the ``checksec`` utility.

    Parses NX, ASLR readiness, PIE, RELRO level, stack canary, and
    FORTIFY_SOURCE status from the binary under examination.

    Parameters
    ----------
    executor:
        A :class:`~sentinel_ctf.executor.base.BaseExecutor` instance.
    """

    name: str = "checksec"
    description: str = "Check binary protections (NX, ASLR, PIE, RELRO, Canary)"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(self, filepath: str) -> str:
        """Build the checksec shell command with JSON-first fallback.

        Attempts JSON output first (``--output=json``); on failure falls
        back to the default human-readable output so that both old and new
        checksec versions are supported.

        Parameters
        ----------
        filepath:
            Path to the target binary on the executor host.

        Returns
        -------
        str
            A shell command string that always produces parseable output.
        """
        safe_path = filepath.replace("'", r"'\''")
        return (
            f"checksec --file={safe_path} --output=json 2>/dev/null "
            f"|| checksec --file={safe_path}"
        )

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse checksec output into a normalised protection dictionary.

        Tries JSON parsing first.  On failure, falls back to heuristic
        text-mode parsing.

        Parameters
        ----------
        result:
            Raw :class:`~sentinel_ctf.executor.base.ExecResult` from the
            executor.

        Returns
        -------
        dict with keys:

        ``arch``   (str)   — detected architecture, e.g. ``"x86_64"``.
        ``bits``   (int)   — word size: 32 or 64.
        ``nx``     (bool)  — NX / DEP enabled.
        ``pie``    (bool)  — Position Independent Executable.
        ``canary`` (bool)  — Stack canary present.
        ``relro``  (str)   — ``"full"``, ``"partial"``, or ``"no"``.
        ``fortify``(bool)  — FORTIFY_SOURCE enabled.
        ``flags_found`` (list[str]) — Any flag-like strings in the output.
        ``raw``    (str)   — Raw stdout for debugging.
        ``exit_code`` (int)— Executor exit code.
        ``error``  (str)   — Stderr content.
        """
        stdout: str = result.stdout or ""
        stderr: str = result.stderr or ""

        # Scan for flags in the raw output regardless of format
        flags_found: list[str] = _FLAG_RE.findall(stdout)

        parsed = self._try_json(stdout)
        if parsed is None:
            parsed = self._parse_text(stdout)

        parsed["flags_found"] = flags_found
        parsed["raw"] = stdout
        parsed["exit_code"] = result.exit_code
        parsed["error"] = stderr.strip()
        return parsed

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _try_json(self, stdout: str) -> dict[str, Any] | None:
        """Attempt to parse a JSON blob from *stdout*.

        checksec --output=json wraps results as::

            {"<filename>": {"nx": "Yes", "pie": "No PIE", ...}}

        Returns ``None`` when stdout is not valid JSON or lacks the
        expected structure.
        """
        # Strip anything before the first '{' to tolerate leading garbage.
        brace_pos = stdout.find('{')
        if brace_pos == -1:
            return None
        try:
            data: dict = json.loads(stdout[brace_pos:])
        except json.JSONDecodeError:
            return None

        # The JSON has one key per file; grab the first file entry.
        if not data:
            return None
        entry: dict = next(iter(data.values()), {})
        if not entry:
            return None

        def _yn(key: str) -> bool:
            """Convert a Yes/No-ish value to bool."""
            val = str(entry.get(key, "")).lower()
            return val not in ("no", "none", "disabled", "0", "false", "")

        # RELRO
        relro_raw = str(entry.get("relro", "")).lower()
        if "full" in relro_raw:
            relro = "full"
        elif "partial" in relro_raw:
            relro = "partial"
        else:
            relro = "no"

        # Architecture / bits
        arch_raw = str(entry.get("arch", "") or entry.get("machine", "")).lower()
        bits_raw = str(entry.get("bits", "") or entry.get("class", ""))
        bits = self._extract_bits(bits_raw + " " + arch_raw)

        return {
            "arch": arch_raw or "unknown",
            "bits": bits,
            "nx": _yn("nx"),
            "pie": _yn("pie"),
            "canary": _yn("canary"),
            "relro": relro,
            "fortify": _yn("fortify"),
        }

    def _parse_text(self, stdout: str) -> dict[str, Any]:
        """Heuristic parser for human-readable checksec output."""
        text = stdout.lower()

        # RELRO
        relro_match = _RELRO_RE.search(stdout)
        if relro_match:
            relro = relro_match.group(1).lower()
        elif "no relro" in text:
            relro = "no"
        else:
            relro = "no"

        # Architecture
        arch_match = _ARCH_RE.search(stdout)
        arch = arch_match.group(1).lower() if arch_match else "unknown"

        # Bits
        bits = self._extract_bits(stdout)

        # Simple keyword checks (absence of "No " prefix)
        nx = _bool_from_text(stdout, "NX") or ("nx enabled" in text)
        pie = "pie enabled" in text or ("pie" in text and "no pie" not in text)
        canary = "canary found" in text or ("stack canary" in text and "no stack canary" not in text)
        fortify = "fortify_source" in text and "no fortify" not in text

        return {
            "arch": arch,
            "bits": bits,
            "nx": nx,
            "pie": pie,
            "canary": canary,
            "relro": relro,
            "fortify": fortify,
        }

    @staticmethod
    def _extract_bits(text: str) -> int:
        """Return 32 or 64 from *text*, defaulting to 64."""
        m = _BITS_RE.search(text)
        if m:
            return int(m.group(1))
        if "elf64" in text.lower() or "64-bit" in text.lower():
            return 64
        if "elf32" in text.lower() or "32-bit" in text.lower():
            return 32
        return 64  # safe default

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def check(self, filepath: str, **kwargs: Any) -> JobResult:
        """Run checksec on *filepath* and return a :class:`JobResult`.

        Parameters
        ----------
        filepath:
            Path to the binary on the executor host.
        **kwargs:
            Forwarded to the underlying executor ``run`` call.

        Returns
        -------
        JobResult
            Structured result with normalised protection flags.
        """
        return await self.run(filepath=filepath, **kwargs)
