"""Strace dynamic system-call tracer tool for binary analysis."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# Canonical strace line:  <pid> <syscall>(<args>) = <retval> [<errno>]
# e.g.: 1234  openat(AT_FDCWD, "/etc/passwd", O_RDONLY) = 3
_STRACE_LINE_RE = re.compile(
    r'^\s*(?:\d+\s+)?'                     # optional PID
    r'(?P<name>[a-z_][a-z0-9_]*)'          # syscall name
    r'\((?P<args>[^)]{0,4096})\)'          # arguments (up to 4 KiB)
    r'\s*=\s*(?P<ret>-?\d+|0x[0-9a-fA-F]+|[?!]+)'  # return value
)

# Filenames from open / openat: first string argument
_OPEN_FILE_RE = re.compile(r'(?:^|,\s*)"((?:[^"\\]|\\.)+)"')

# connect() dest: inet_addr("x.x.x.x"), htons(PORT)
_CONNECT_ADDR_RE = re.compile(
    r'inet_addr\("([^"]+)"\).*?htons\((\d+)\)',
    re.DOTALL,
)
# IPv6 variation
_CONNECT_ADDR6_RE = re.compile(
    r'inet6_addr\("([^"]+)"\).*?htons\((\d+)\)',
    re.DOTALL,
)

# String arguments inside read/write: quoted C-style strings
_STRING_ARG_RE = re.compile(r'"((?:[^"\\]|\\.){1,256})"')


class StraceTool(BaseTool):
    """Dynamic system-call tracer tool wrapping Linux ``strace``.

    Executes a binary under ``strace`` with a configurable set of traced
    system calls and an optional input payload.  The parser reconstructs
    a structured view of every captured syscall, the files opened, the
    network connections attempted, and any interesting string arguments
    passed to I/O calls.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "strace"
    description: str = "System call tracer for dynamic analysis"

    _DEFAULT_TRACE = "read,write,open,openat,execve,connect,recvfrom,sendto"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        binary: str,
        args: str = "",
        input_data: str = "",
        timeout: int = 10,
        trace_calls: str = _DEFAULT_TRACE,
    ) -> str:
        """Build the ``strace`` invocation shell command.

        Args:
            binary: Absolute path to the binary to trace.
            args: Space-separated command-line arguments forwarded to the
                binary.
            input_data: Data to supply on the binary's stdin via a here-string
                (``<<< '...'``).  Empty string disables stdin redirection.
            timeout: Maximum number of seconds to allow the binary to run
                before ``timeout`` terminates it.  Defaults to ``10``.
            trace_calls: Comma-separated list of system call names to trace.
                Defaults to a useful set for CTF challenges.

        Returns:
            A shell command string whose stderr is merged into stdout so
            that strace diagnostic output (which goes to stderr by default)
            is captured by the executor.
        """
        stdin_redirect = f" <<< {repr(input_data)}" if input_data else ""
        parts = [
            f"timeout {timeout}",
            "strace",
            f"-e trace={trace_calls}",
            "-f",
            binary,
            args,
            "2>&1",
            stdin_redirect,
        ]
        return " ".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse strace output into a structured system-call analysis.

        Each line of strace output is matched against the canonical
        ``<syscall>(<args>) = <retval>`` format and decomposed into a
        structured dict.  Specialised extractors then pull file paths from
        ``open``/``openat`` calls, IP:port pairs from ``connect`` calls, and
        string arguments from ``read``/``write`` calls.  The entire output
        is also scanned for CTF flag patterns.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor.

        Returns:
            A dictionary with the following keys:

            * ``syscalls`` (*list[dict]*): Each entry contains:
              - ``name`` (*str*): System call name.
              - ``args_snippet`` (*str*): First 200 chars of the argument
                string.
              - ``return_value`` (*str*): Parsed return value.
            * ``open_files`` (*list[str]*): Filenames extracted from
              ``open`` and ``openat`` calls.
            * ``network_connections`` (*list[str]*): ``"ip:port"`` strings
              from ``connect`` system calls.
            * ``string_args`` (*list[str]*): Interesting string literals
              found in ``read``/``write`` argument lists.
            * ``flags_found`` (*list[str]*): CTF flag strings identified
              anywhere in the output.
            * ``raw_output`` (*str*): Raw verbatim strace output.
        """
        output: str = result.stdout or ""
        syscalls: list[dict] = []
        open_files: list[str] = []
        network_connections: list[str] = []
        string_args: list[str] = []
        flags_found: list[str] = []

        for line in output.splitlines():
            line_s = line.strip()
            if not line_s:
                continue

            m = _STRACE_LINE_RE.match(line_s)
            if not m:
                continue

            name = m.group("name")
            args_raw = m.group("args")
            ret_val = m.group("ret")

            syscalls.append(
                {
                    "name": name,
                    "args_snippet": args_raw[:200],
                    "return_value": ret_val,
                }
            )

            # ---- open / openat → file paths ----
            if name in ("open", "openat"):
                for file_m in _OPEN_FILE_RE.finditer(args_raw):
                    path = file_m.group(1)
                    if path not in open_files:
                        open_files.append(path)

            # ---- connect → network endpoints ----
            if name == "connect":
                for conn_m in _CONNECT_ADDR_RE.finditer(args_raw):
                    endpoint = f"{conn_m.group(1)}:{conn_m.group(2)}"
                    if endpoint not in network_connections:
                        network_connections.append(endpoint)
                for conn_m in _CONNECT_ADDR6_RE.finditer(args_raw):
                    endpoint = f"{conn_m.group(1)}:{conn_m.group(2)}"
                    if endpoint not in network_connections:
                        network_connections.append(endpoint)

            # ---- read / write → string arguments ----
            if name in ("read", "write", "recvfrom", "sendto"):
                for str_m in _STRING_ARG_RE.finditer(args_raw):
                    s = str_m.group(1)
                    if len(s) > 3 and s not in string_args:
                        string_args.append(s)

        # Scan entire output for flags
        flags_found.extend(_FLAG_PATTERN.findall(output))

        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "syscalls": syscalls,
            "open_files": open_files,
            "network_connections": network_connections,
            "string_args": string_args,
            "flags_found": unique_flags,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def trace(self, binary: str, **kwargs: Any) -> JobResult:
        """Run strace and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` in a single awaitable call.

        Args:
            binary: Path to the binary to trace.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``args``, ``input_data``, ``timeout``, ``trace_calls``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed syscall trace dictionary.
        """
        command = self.build_command(binary, **kwargs)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
