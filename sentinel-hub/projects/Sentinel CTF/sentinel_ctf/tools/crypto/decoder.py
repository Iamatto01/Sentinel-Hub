"""
Multi-encoding decoder/identifier tool plugin for the Sentinel CTF Framework.

This tool runs entirely in the local Python process — no Kali / remote executor
needed.  It can operate either via subprocess (``build_command`` / ``parse``)
for consistency with the rest of the plugin API, or via the pure-Python static
method :meth:`DecoderTool.try_all` for direct in-process decoding.

Supported encodings
-------------------
* ``base64``   – standard alphabet (RFC 4648) + URL-safe variant
* ``hex``      – lowercase and uppercase hex strings
* ``url``      – percent-encoded (URL-encoded) strings
* ``rot13``    – Caesar cipher with rotation of 13
* ``binary``   – space-separated 8-bit binary groups (e.g. ``01000001 01000010``)
"""

from __future__ import annotations

import base64
import binascii
import codecs
import re
import urllib.parse
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ALL_ENCODINGS: list[str] = ["base64", "hex", "url", "rot13", "binary"]
_DEFAULT_FLAG_REGEX = r"flag\{[^}]+\}"

# Characters that indicate a string is likely human-readable ASCII
_PRINTABLE_RE = re.compile(r"^[\x20-\x7e\t\n\r]+$")


def _readability_score(text: str) -> int:
    """Return a heuristic readability score (higher = more printable ASCII)."""
    if not text:
        return 0
    printable = sum(1 for ch in text if 0x20 <= ord(ch) <= 0x7E)
    return printable


# ---------------------------------------------------------------------------
# Inline Python snippet embedded in the subprocess command
# ---------------------------------------------------------------------------

_INLINE_DECODER_CODE = r"""
import sys, base64, codecs, urllib.parse, re

data = {data_repr}
results = {{}}

# base64 (standard)
try:
    decoded = base64.b64decode(data + '==').decode('utf-8', errors='replace')
    results['base64'] = decoded
except Exception:
    results['base64'] = ''

# base64 url-safe
try:
    decoded = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
    results['base64_urlsafe'] = decoded
except Exception:
    results['base64_urlsafe'] = ''

# hex
try:
    decoded = bytes.fromhex(data.replace(' ', '')).decode('utf-8', errors='replace')
    results['hex'] = decoded
except Exception:
    results['hex'] = ''

# url
try:
    results['url'] = urllib.parse.unquote_plus(data)
except Exception:
    results['url'] = ''

# rot13
try:
    results['rot13'] = codecs.decode(data, 'rot_13')
except Exception:
    results['rot13'] = ''

# binary (space-separated 8-bit groups)
try:
    groups = data.strip().split()
    if all(len(g) == 8 and set(g) <= {{'0','1'}} for g in groups):
        results['binary'] = ''.join(chr(int(g, 2)) for g in groups)
    else:
        results['binary'] = ''
except Exception:
    results['binary'] = ''

for enc, val in results.items():
    print(f'{{enc}}|||{{val}}')
"""


class DecoderTool(BaseTool):
    """Multi-encoding decode chain tool."""

    name: str = "decoder"
    description: str = "Multi-encoding decode chain"

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def build_command(
        self,
        data: str,
        chain: list[str] | None = None,  # noqa: ARG002 – chain is informational; the inline code tries all
    ) -> str:
        """Return a ``python3 -c "..."`` one-liner that decodes *data*.

        The generated command tries every encoding in *chain* (defaulting to
        all known encodings) and prints ``<encoding>|||<result>`` lines for
        each attempt.  Results for failed decodes are printed as empty strings
        so the parser always gets a fixed number of lines.

        Args:
            data: The encoded string to decode.
            chain: Ordered list of encoding names to attempt.  If ``None``,
                all supported encodings are tried.  Currently the inline code
                always tries all five encodings regardless; the parameter is
                accepted for API compatibility and future filtering.

        Returns:
            A shell command string beginning with ``python3 -c``.
        """
        # Store for parse()
        self._last_data = data
        self._last_chain = chain or _ALL_ENCODINGS

        inline = _INLINE_DECODER_CODE.format(data_repr=repr(data))
        # Collapse to a safe single-quoted block via repr so the shell sees it
        # as a single argument.
        import shlex  # local import to keep top-level imports clean
        return f"python3 -c {shlex.quote(inline)}"

    # ------------------------------------------------------------------
    # Output parser
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse ``<encoding>|||<value>`` lines into a structured dictionary.

        Args:
            result: :class:`~sentinel_ctf.executor.base.ExecResult` returned
                by the executor.

        Returns:
            A dictionary with:

            * ``decoded`` (*dict[str, str]*) – mapping of encoding name to the
              decoded string (empty string if decoding failed or produced
              non-printable output).
            * ``flags_found`` (*list[str]*) – flag-pattern matches across all
              decoded values.
            * ``best_guess`` (*str*) – name of the encoding that produced the
              most readable ASCII output; empty string if none succeeded.
        """
        stdout: str = result.stdout or ""
        flag_regex: str = getattr(self, "_flag_regex", _DEFAULT_FLAG_REGEX)

        decoded: dict[str, str] = {}
        for line in stdout.splitlines():
            if "|||" in line:
                enc, _, val = line.partition("|||")
                decoded[enc.strip()] = val  # keep raw; may contain newlines at end

        # --- flags_found -------------------------------------------------
        all_text = "\n".join(decoded.values())
        flags_found: list[str] = re.findall(flag_regex, all_text)

        # --- best_guess --------------------------------------------------
        best_guess = ""
        best_score = 0
        for enc, val in decoded.items():
            if not val:
                continue
            score = _readability_score(val)
            if score > best_score:
                best_score = score
                best_guess = enc

        return {
            "decoded": decoded,
            "flags_found": flags_found,
            "best_guess": best_guess,
        }

    # ------------------------------------------------------------------
    # Convenience shortcut
    # ------------------------------------------------------------------

    async def decode(self, data: str, **kwargs: Any) -> JobResult:
        """High-level shortcut: build command, execute, parse, and return a :class:`JobResult`.

        Args:
            data: The encoded string to decode.
            **kwargs: Extra keyword arguments forwarded to
                :meth:`build_command` (e.g. ``chain``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` containing the
            structured decoded data as its ``data`` payload.
        """
        chain: list[str] | None = kwargs.pop("chain", None)
        flag_regex: str = kwargs.pop("flag_regex", _DEFAULT_FLAG_REGEX)
        self._flag_regex = flag_regex

        command = self.build_command(data, chain=chain)
        exec_result: ExecResult = await self.executor.run(command, **kwargs)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            raw=exec_result,
            data=parsed,
            success=exec_result.returncode == 0,
        )

    # ------------------------------------------------------------------
    # Pure-Python in-process decoder (no subprocess)
    # ------------------------------------------------------------------

    @staticmethod
    def try_all(data: str) -> dict[str, str]:
        """Try every supported encoding in-process and return a results mapping.

        Unlike :meth:`build_command` + :meth:`parse`, this method performs all
        decoding directly in Python without spawning a subprocess — useful for
        lightweight analysis or when no executor is available.

        Args:
            data: The encoded string to attempt to decode.

        Returns:
            A dictionary mapping encoding names to decoded strings.  If a
            particular encoding fails (e.g. invalid input), its value is an
            empty string.  Never raises.

        Supported keys in the returned dict
        ------------------------------------
        * ``"base64"``         – standard Base64 (padding auto-added)
        * ``"base64_urlsafe"`` – URL-safe Base64 (padding auto-added)
        * ``"hex"``            – hexadecimal (spaces stripped before decoding)
        * ``"url"``            – percent / URL encoding
        * ``"rot13"``          – ROT-13 Caesar cipher
        * ``"binary"``         – space-separated 8-bit binary groups
        """
        results: dict[str, str] = {}

        # --- base64 (standard) -------------------------------------------
        try:
            # Add padding so b64decode doesn't raise on non-padded input
            padded = data + "=" * (-len(data) % 4)
            results["base64"] = base64.b64decode(padded).decode("utf-8", errors="replace")
        except Exception:
            results["base64"] = ""

        # --- base64 url-safe ---------------------------------------------
        try:
            padded = data + "=" * (-len(data) % 4)
            results["base64_urlsafe"] = base64.urlsafe_b64decode(padded).decode(
                "utf-8", errors="replace"
            )
        except Exception:
            results["base64_urlsafe"] = ""

        # --- hex ---------------------------------------------------------
        try:
            clean_hex = data.replace(" ", "").replace("\n", "").replace("\r", "")
            results["hex"] = bytes.fromhex(clean_hex).decode("utf-8", errors="replace")
        except Exception:
            results["hex"] = ""

        # --- url ---------------------------------------------------------
        try:
            results["url"] = urllib.parse.unquote_plus(data)
        except Exception:
            results["url"] = ""

        # --- rot13 -------------------------------------------------------
        try:
            results["rot13"] = codecs.decode(data, "rot_13")
        except Exception:
            results["rot13"] = ""

        # --- binary (space-separated 8-bit groups) -----------------------
        try:
            groups = data.strip().split()
            if groups and all(len(g) == 8 and set(g) <= {"0", "1"} for g in groups):
                results["binary"] = "".join(chr(int(g, 2)) for g in groups)
            else:
                results["binary"] = ""
        except Exception:
            results["binary"] = ""

        return results
