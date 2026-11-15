"""Pure-Python LSB steganography analyser for PNG images."""

import re
import struct
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

_PRINTABLE_RE = re.compile(r'[^\x20-\x7e\t\n\r]')

# Python one-liner template for the subprocess path
_ONELINER_TMPL = (
    "python3 -c \""
    "import sys, struct;"
    "try:"
    "  from PIL import Image;"
    "  img=Image.open('{filepath}').convert('RGB');"
    "  px=list(img.getdata());"
    "  channels='{channels}';"
    "  ch_idx=[('R','G','B').index(c) for c in channels if c in ('R','G','B')];"
    "  bits=[];"
    "  mask=(1<<{bits})-1;"
    "  [bits.extend((px[i][j]>>k)&1 for j in ch_idx for k in range({bits}-1,-1,-1)) for i in range(len(px))];"
    "  ba=bytearray(int(''.join(map(str,bits[i:i+8])),2) for i in range(0,len(bits)-7,8));"
    "  sys.stdout.buffer.write(ba)"
    "except Exception as e: sys.stderr.write(str(e)+'\\n')\""
)


class LsbTool(BaseTool):
    """Pure-Python LSB steganography analyser for PNG images.

    This tool does **not** require an external binary — it operates either
    through the :meth:`extract_lsb` static method (in-process, zero latency)
    or via a Python one-liner executed by the framework executor so that
    sandboxed/remote executors are also supported.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "lsb"
    description: str = "Pure-Python LSB steganography analysis for PNG images"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        bits: int = 1,
        channels: str = "RGB",
    ) -> str:
        """Build a Python one-liner that extracts LSB data via PIL.

        The generated one-liner is self-contained and can be executed by any
        executor that has Python 3 + Pillow available.  It reads the image,
        extracts the least-significant ``bits`` bits from each pixel channel
        listed in ``channels``, packs them into bytes, and writes the raw
        binary result to stdout.

        Args:
            filepath: Absolute path to the target PNG (or other PIL-readable)
                image file.
            bits: Number of least-significant bits to extract per channel
                per pixel (1–8).  Defaults to ``1``.
            channels: String containing the channel letters to sample, e.g.
                ``"RGB"``, ``"R"``, or ``"GB"``.  Order is preserved.

        Returns:
            A ``python3 -c "..."`` shell command string.
        """
        return _ONELINER_TMPL.format(
            filepath=filepath,
            bits=int(bits),
            channels=channels,
        )

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse the raw LSB bytes produced by the one-liner into a result dict.

        The one-liner writes raw binary to stdout; the executor returns it as
        a (possibly encoded) string.  This method converts it to a hex
        representation and a printable ASCII preview, then scans for flags.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor after running the one-liner command.

        Returns:
            A dictionary with the following keys:

            * ``lsb_data_hex`` (*str*): Hex dump of the extracted LSB bytes.
            * ``lsb_data_ascii`` (*str*): Printable ASCII characters found in
              the extracted bytes (non-printable characters stripped).
            * ``flags_found`` (*list[str]*): CTF flag strings identified in
              the extracted data.
            * ``raw_output`` (*str*): Raw output string from the executor.
        """
        raw_output: str = result.stdout or ""

        # The executor may return binary data encoded as latin-1 or bytes
        if isinstance(result.stdout, bytes):
            lsb_bytes = result.stdout
        else:
            lsb_bytes = raw_output.encode("latin-1", errors="replace")

        lsb_data_hex = lsb_bytes.hex()
        lsb_data_ascii = _PRINTABLE_RE.sub("", lsb_bytes.decode("latin-1", errors="replace"))

        flags_found: list[str] = []
        flags_found.extend(_FLAG_PATTERN.findall(lsb_data_ascii))
        flags_found.extend(_FLAG_PATTERN.findall(raw_output))

        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "lsb_data_hex": lsb_data_hex,
            "lsb_data_ascii": lsb_data_ascii,
            "flags_found": unique_flags,
            "raw_output": raw_output,
        }

    # ------------------------------------------------------------------
    # In-process LSB extraction (no executor required)
    # ------------------------------------------------------------------

    @staticmethod
    def extract_lsb(filepath: str, bits: int = 1, channels: str = "RGB") -> bytes:
        """Extract LSB steganographic data directly using PIL (in-process).

        Opens the image with ``PIL.Image``, iterates over every pixel, and
        collects the least-significant ``bits`` bits from each channel listed
        in ``channels``.  The collected bit-stream is packed big-endian into
        bytes and returned.

        This method runs in the current process, making it ideal for local
        analysis where subprocess overhead should be avoided.

        Args:
            filepath: Path to the image file (any PIL-readable format).
            bits: Number of least-significant bits per channel per pixel
                to extract (1–8).  Defaults to ``1``.
            channels: Channel selection string, e.g. ``"RGB"``, ``"R"``.
                Characters not in ``{'R', 'G', 'B'}`` are silently ignored.

        Returns:
            Raw bytes assembled from the extracted bit-stream.  Returns
            ``b''`` if PIL is not installed or the image cannot be opened.
        """
        try:
            from PIL import Image  # type: ignore[import]
        except ImportError:
            return b""

        try:
            img = Image.open(filepath).convert("RGB")
        except Exception:
            return b""

        channel_map = {"R": 0, "G": 1, "B": 2}
        ch_indices = [channel_map[c] for c in channels if c in channel_map]
        if not ch_indices:
            return b""

        mask = (1 << bits) - 1
        pixels = list(img.getdata())
        bit_stream: list[int] = []

        for pixel in pixels:
            for ch_idx in ch_indices:
                value = pixel[ch_idx] & mask
                # Extract bits from MSB to LSB of the extracted value
                for shift in range(bits - 1, -1, -1):
                    bit_stream.append((value >> shift) & 1)

        # Pack bits into bytes
        result_bytes = bytearray()
        for i in range(0, len(bit_stream) - 7, 8):
            byte_bits = bit_stream[i : i + 8]
            byte_val = int("".join(map(str, byte_bits)), 2)
            result_bytes.append(byte_val)

        return bytes(result_bytes)

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def analyze(self, filepath: str, **kwargs: Any) -> JobResult:
        """Run LSB analysis and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Attempts in-process extraction first via :meth:`extract_lsb`.  If
        that returns data, it is used directly without spawning a subprocess.
        Otherwise the one-liner produced by :meth:`build_command` is executed
        via the framework executor.

        Args:
            filepath: Path to the PNG image to analyse.
            **kwargs: Forwarded to :meth:`build_command` / :meth:`extract_lsb`
                (e.g. ``bits``, ``channels``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed LSB analysis dictionary.
        """
        bits: int = int(kwargs.get("bits", 1))
        channels: str = str(kwargs.get("channels", "RGB"))

        # Prefer in-process extraction when PIL is available
        lsb_bytes = self.extract_lsb(filepath, bits=bits, channels=channels)
        command = self.build_command(filepath, bits=bits, channels=channels)

        if lsb_bytes:
            # Build a synthetic ExecResult from in-process data
            lsb_data_ascii = _PRINTABLE_RE.sub(
                "", lsb_bytes.decode("latin-1", errors="replace")
            )
            flags_found: list[str] = list(
                dict.fromkeys(_FLAG_PATTERN.findall(lsb_data_ascii))
            )
            parsed = {
                "lsb_data_hex": lsb_bytes.hex(),
                "lsb_data_ascii": lsb_data_ascii,
                "flags_found": flags_found,
                "raw_output": f"(in-process extraction: {len(lsb_bytes)} bytes)",
            }
            return JobResult(
                tool=self.name,
                command=command,
                returncode=0,
                data=parsed,
                flags_found=flags_found,
            )

        # Fall back to executor (remote/sandbox environments)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
