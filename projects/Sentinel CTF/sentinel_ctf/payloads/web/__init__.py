"""
sentinel_ctf.payloads.web
==========================
Web exploitation payload lists and mutation engine.
"""

from sentinel_ctf.payloads.web.payloads import (
    SQL_INJECTION,
    XSS_PAYLOADS,
    LFI_PAYLOADS,
    SSTI_PAYLOADS,
    COMMAND_INJECTION,
    XXES,
    OPEN_REDIRECT,
    JWT_NONE_ALG,
    PayloadEngine,
)

__all__ = [
    "SQL_INJECTION", "XSS_PAYLOADS", "LFI_PAYLOADS", "SSTI_PAYLOADS",
    "COMMAND_INJECTION", "XXES", "OPEN_REDIRECT", "JWT_NONE_ALG",
    "PayloadEngine",
]
