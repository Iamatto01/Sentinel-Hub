"""Network packet capture analysis tool wrapping tshark."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# HTTP verb at start of a line → request
_HTTP_REQUEST_RE = re.compile(
    r'^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT)\s+\S+\s+HTTP/[\d.]+',
    re.MULTILINE,
)
# HTTP response status line
_HTTP_RESPONSE_RE = re.compile(r'^HTTP/[\d.]+\s+\d{3}.*', re.MULTILINE)

# Basic credential heuristics
_CRED_AUTH_RE = re.compile(r'Authorization:\s*\S+\s+\S+', re.IGNORECASE)
_CRED_BASIC_RE = re.compile(r'[\w.+-]{1,64}:[\w!@#$%^&*()\-+=]{1,64}')

# Conversation endpoint pair
_IP_FLOW_RE = re.compile(
    r'(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?'
)


class PcapTool(BaseTool):
    """Network capture analysis tool wrapping the ``tshark`` dissector.

    Supports both field-based tabular output for generic traffic inspection
    and stream-follow mode for reconstructing TCP/UDP conversation payloads.
    The parser extracts packet metadata, unique IP conversations, HTTP data,
    plaintext credentials, and CTF flag patterns from the captured traffic.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "pcap"
    description: str = "Network capture analysis with tshark"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        pcap_file: str,
        display_filter: str = "",
        follow_stream: str = "",
        extra_flags: str = "",
    ) -> str:
        """Build the tshark shell command for packet or stream analysis.

        Two operating modes are supported:

        **Stream-follow mode** (when ``follow_stream`` is provided):
        Reconstructs the raw ASCII payload of a TCP stream index extracted
        from the ``follow_stream`` expression (e.g. ``"tcp.stream eq 0"``).

        **Field extraction mode** (default):
        Produces a TSV file containing frame number, source/destination IP,
        source/destination TCP port, protocol, and info column, optionally
        filtered by a display filter expression.

        Args:
            pcap_file: Path to the ``.pcap`` or ``.pcapng`` file.
            display_filter: A Wireshark display filter expression applied
                with ``-Y`` (e.g. ``"http"`` or ``"tcp.port == 80"``).
                Ignored in stream-follow mode.
            follow_stream: A Wireshark filter that identifies the stream
                index (e.g. ``"tcp.stream eq 0"``).  When non-empty, the
                command switches to stream-follow mode.
            extra_flags: Additional raw flags appended to the command
                string in field extraction mode only.

        Returns:
            A complete shell command string ready for execution.
        """
        if follow_stream:
            # Extract the stream number from the filter expression
            stream_num_match = re.search(r'eq\s+(\d+)', follow_stream)
            stream_num = stream_num_match.group(1) if stream_num_match else "0"
            return (
                f"tshark -r {pcap_file} -q "
                f"-z follow,tcp,ascii,{stream_num} 2>/dev/null"
            )

        filter_flag = f"-Y {display_filter!r}" if display_filter else ""
        fields = (
            "-T fields "
            "-e frame.number "
            "-e ip.src "
            "-e ip.dst "
            "-e tcp.srcport "
            "-e tcp.dstport "
            "-e _ws.col.Protocol "
            "-e _ws.col.Info "
            "-E header=y"
        )
        parts = [
            "tshark",
            "-r", pcap_file,
            filter_flag,
            fields,
            "2>/dev/null",
            extra_flags,
        ]
        return " ".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse tshark output into structured packet/conversation data.

        Handles both TSV field-extraction output and stream-follow ASCII
        output produced by tshark's ``-z follow,tcp,ascii`` mode.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor after running the tshark command.

        Returns:
            A dictionary with the following keys:

            * ``packets`` (*list[dict]*): Each entry contains
              ``frame``, ``src_ip``, ``dst_ip``, ``src_port``,
              ``dst_port``, ``protocol``, ``info`` parsed from the TSV
              header line and data rows.
            * ``conversations`` (*list[str]*): Unique ``"src_ip → dst_ip"``
              address pairs observed in the capture.
            * ``flags_found`` (*list[str]*): CTF flag strings found anywhere
              in the output.
            * ``http_data`` (*list[str]*): HTTP request line or status line
              snippets found in the output.
            * ``credentials`` (*list[str]*): Strings that look like HTTP
              Authorization headers or ``user:pass`` pairs.
            * ``raw_output`` (*str*): Raw verbatim tshark output.
        """
        output: str = result.stdout or ""
        packets: list[dict] = []
        conversations: list[str] = []
        flags_found: list[str] = []
        http_data: list[str] = []
        credentials: list[str] = []

        lines = output.splitlines()

        # ---- TSV field-extraction mode detection ----
        # tshark -E header=y emits a header line whose first token is
        # "frame.number" when at least one packet matched.
        if lines and lines[0].startswith("frame.number"):
            headers = lines[0].split("\t")
            col_map = {h: i for i, h in enumerate(headers)}

            for line in lines[1:]:
                if not line.strip():
                    continue
                cols = line.split("\t")

                def _col(name: str) -> str:
                    idx = col_map.get(name)
                    return cols[idx].strip() if idx is not None and idx < len(cols) else ""

                pkt = {
                    "frame": _col("frame.number"),
                    "src_ip": _col("ip.src"),
                    "dst_ip": _col("ip.dst"),
                    "src_port": _col("tcp.srcport"),
                    "dst_port": _col("tcp.dstport"),
                    "protocol": _col("_ws.col.Protocol"),
                    "info": _col("_ws.col.Info"),
                }
                packets.append(pkt)

                # Build conversation strings
                if pkt["src_ip"] and pkt["dst_ip"]:
                    conv = f"{pkt['src_ip']} → {pkt['dst_ip']}"
                    if conv not in conversations:
                        conversations.append(conv)

        # ---- Scan the full output for higher-level artefacts ----
        # HTTP request / response snippets
        for m in _HTTP_REQUEST_RE.finditer(output):
            snippet = m.group(0)[:200]
            if snippet not in http_data:
                http_data.append(snippet)

        for m in _HTTP_RESPONSE_RE.finditer(output):
            snippet = m.group(0)[:200]
            if snippet not in http_data:
                http_data.append(snippet)

        # Authorization headers
        for m in _CRED_AUTH_RE.finditer(output):
            cred = m.group(0)[:200]
            if cred not in credentials:
                credentials.append(cred)

        # Basic user:pass patterns (only if they look plausible — avoid noise
        # from IP addresses etc. by requiring the colon is not between digits)
        for m in _CRED_BASIC_RE.finditer(output):
            candidate = m.group(0)
            # Filter out IP:port look-alikes
            if not re.match(r'^\d+:\d+$', candidate):
                if candidate not in credentials:
                    credentials.append(candidate)

        # Flag patterns
        flags_found.extend(_FLAG_PATTERN.findall(output))

        # Deduplicate flags
        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "packets": packets,
            "conversations": conversations,
            "flags_found": unique_flags,
            "http_data": http_data,
            "credentials": credentials,
            "raw_output": output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def analyze(self, pcap_file: str, **kwargs: Any) -> JobResult:
        """Run tshark analysis and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` into a single awaitable call.

        Args:
            pcap_file: Path to the pcap/pcapng capture file.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``display_filter``, ``follow_stream``, ``extra_flags``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed packet analysis dictionary.
        """
        command = self.build_command(pcap_file, **kwargs)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
