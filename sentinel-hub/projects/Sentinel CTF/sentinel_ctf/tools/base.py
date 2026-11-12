"""
sentinel_ctf.tools.base
=======================
Abstract base class for all tool plugins.
Each tool plugin wraps one external binary (nmap, ffuf, binwalk, …).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult


class BaseTool(ABC):
    """
    Base for every tool plugin.

    Subclasses implement:
    - ``build_command(**kwargs) -> str``      Build the CLI string
    - ``parse(result: ExecResult) -> dict``   Extract structured data
    """

    name: str = "base"
    description: str = ""

    def __init__(self, executor: BaseExecutor) -> None:
        self.executor = executor

    @abstractmethod
    def build_command(self, **kwargs: Any) -> str:
        """Return the shell command string to run the tool."""
        ...

    @abstractmethod
    def parse(self, result: ExecResult) -> dict[str, Any]:
        """Parse raw ExecResult into a structured dict."""
        ...

    async def run(self, timeout: float = 300.0, **kwargs: Any) -> JobResult:
        """Build + execute + parse in one call."""
        cmd = self.build_command(**kwargs)
        raw = await self.executor.run(cmd, timeout=timeout)
        parsed = self.parse(raw)
        return JobResult(
            stdout=raw.stdout,
            stderr=raw.stderr,
            return_code=raw.return_code,
            duration_s=raw.duration_s,
            parsed=parsed,
            flags_found=parsed.get("flags_found", []),
        )
