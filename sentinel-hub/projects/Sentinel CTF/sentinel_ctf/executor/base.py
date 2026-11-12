"""
sentinel_ctf.executor.base
==========================
Abstract executor interface. Every backend (local, SSH, Docker) implements this.
"""
from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ExecResult:
    """Raw result from an executor run."""
    stdout: str
    stderr: str
    return_code: int
    duration_s: float
    command: str


class BaseExecutor(ABC):
    """
    Abstract base for all execution backends.

    Usage::

        async with SomeExecutor(...) as ex:
            result = await ex.run("ls -la /tmp")
    """

    @abstractmethod
    async def run(
        self,
        command: str,
        cwd: str | None = None,
        timeout: float = 120.0,
        env: dict[str, str] | None = None,
    ) -> ExecResult:
        """Execute *command* and return the result."""
        ...

    @abstractmethod
    async def upload(self, local_path: str, remote_path: str) -> None:
        """Upload a file from the local machine to the execution environment."""
        ...

    @abstractmethod
    async def download(self, remote_path: str, local_path: str) -> None:
        """Download a file from the execution environment to the local machine."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Release underlying resources."""
        ...

    async def __aenter__(self) -> "BaseExecutor":
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()
