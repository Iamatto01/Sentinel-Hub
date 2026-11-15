"""Audio steganography analysis tool for CTF misc/forensics challenges."""

import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_PATTERN = re.compile(
    r'(?:flag|ctf|HTB|picoCTF|DUCTF|CSAW|TUCTF|darkCTF|[A-Z]{2,8}CTF)\{[^}]{1,256}\}',
    re.IGNORECASE,
)

# Key:value lines from spectrogram one-liner output
_INFO_LINE_RE = re.compile(r'(?P<key>[\w\s]+):\s*(?P<value>.+)')

# Printable ASCII filter
_PRINTABLE_RE = re.compile(r'[^\x20-\x7e]')

# ---- One-liner templates -------------------------------------------------

_SPECTROGRAM_ONELINER = (
    "python3 -c \""
    "import numpy as np, scipy.io.wavfile as wf, scipy.signal as ss, sys; "
    "sr,d=wf.read('{filepath}'); "
    "mono=d if d.ndim==1 else d[:,0]; "
    "f,t,Sxx=ss.spectrogram(mono, sr); "
    "print(f'Sample rate: {{sr}}'); "
    "print(f'Duration: {{len(d)/sr:.1f}}s'); "
    "print(f'Freq range: {{f.min():.0f}}-{{f.max():.0f}}Hz'); "
    "print(f'Channels: {{1 if d.ndim==1 else d.shape[1]}}'); "
    "print('Use Audacity to view spectrogram visually')\""
)

_LSB_ONELINER = (
    "python3 -c \""
    "import struct, sys; "
    "data=open('{filepath}','rb').read(); "
    "# Skip WAV header (44 bytes for PCM) and read 16-bit LE samples; "
    "samples=struct.unpack_from('<' + str((len(data)-44)//2) + 'h', data, 44); "
    "bits=[s & 1 for s in samples]; "
    "ba=bytearray(int(''.join(map(str,bits[i:i+8])),2) for i in range(0,len(bits)-7,8)); "
    "sys.stdout.buffer.write(bytes(ba))\""
)

_MORSE_COMMAND = (
    "sox {filepath} -r 8000 -e signed-integer -b 16 -c 1 /tmp/_sentinel_morse.wav 2>/dev/null "
    "&& python3 -c \""
    "import struct; "
    "data=open('/tmp/_sentinel_morse.wav','rb').read()[44:]; "
    "samples=struct.unpack_from('<'+str(len(data)//2)+'h', data); "
    "peak=max(abs(s) for s in samples) or 1; "
    "norm=[abs(s)/peak for s in samples]; "
    "sr=8000; win=int(sr*0.05); "
    "energy=[sum(norm[i:i+win])/win for i in range(0,len(norm)-win,win)]; "
    "thresh=0.1; "
    "signal=['1' if e>thresh else '0' for e in energy]; "
    "run=''.join(signal); "
    "print('Signal pattern (1=tone, 0=silence):', run[:200])\""
)

_SOX_INFO_FALLBACK = "sox --info {filepath} 2>&1"


class AudioTool(BaseTool):
    """Audio steganography analysis tool for WAV/MP3/OGG files.

    Supports three analysis modes:

    * **spectrogram** (default): Extracts sample rate, duration, channel
      count, and frequency range metadata using ``scipy``.  Reminds the
      analyst to view the spectrogram visually in Audacity for hidden images.
    * **lsb**: Extracts the least-significant bit of each 16-bit WAV sample
      and packs the bits into bytes, then scans for embedded text.
    * **morse**: Converts the audio to normalised mono, computes energy per
      50 ms window, and prints a binary signal pattern for manual Morse
      decoding.  Falls back to ``sox --info`` if the Morse pipeline fails.

    Attributes:
        name: Canonical tool identifier used by the framework registry.
        description: Human-readable summary shown in tool listings.
    """

    name: str = "audio"
    description: str = "Audio steganography analysis"

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        analysis_type: str = "spectrogram",
    ) -> str:
        """Build the audio analysis shell command for the specified mode.

        Args:
            filepath: Absolute path to the audio file (WAV recommended for
                ``lsb`` and ``morse`` modes; any format for ``spectrogram``
                if scipy.io.wavfile can open it).
            analysis_type: One of ``"spectrogram"`` (default), ``"lsb"``,
                or ``"morse"``.  Unrecognised values fall back to
                ``"spectrogram"``.

        Returns:
            A shell command string appropriate for the requested analysis
            mode.
        """
        if analysis_type == "lsb":
            return _LSB_ONELINER.format(filepath=filepath)

        if analysis_type == "morse":
            morse_cmd = _MORSE_COMMAND.format(filepath=filepath)
            fallback = _SOX_INFO_FALLBACK.format(filepath=filepath)
            return f"{morse_cmd} || {fallback}"

        # Default: spectrogram metadata
        return _SPECTROGRAM_ONELINER.format(filepath=filepath)

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict:
        """Parse audio analysis output into structured metadata.

        The parser auto-detects whether the output contains spectrogram
        metadata key:value lines or raw binary LSB data, and populates the
        appropriate fields accordingly.

        Args:
            result: The :class:`~sentinel_ctf.executor.base.ExecResult`
                produced by the executor after running the analysis command.

        Returns:
            A dictionary with the following keys:

            * ``info`` (*dict*): Parsed key→value pairs from spectrogram /
              sox info output (e.g. ``{"Sample rate": "44100",
              "Duration": "12.3s"}``).  Empty dict for pure LSB mode.
            * ``lsb_data`` (*str*): Printable ASCII string extracted from
              LSB bytes.  Empty string when not in LSB mode.
            * ``flags_found`` (*list[str]*): CTF flag strings identified
              in any part of the output.
            * ``raw_output`` (*str*): Raw verbatim analysis output.
        """
        raw_output: str = result.stdout or ""
        info: dict[str, str] = {}
        lsb_data: str = ""
        flags_found: list[str] = []

        # Detect binary LSB output: if most bytes are non-printable it's binary
        raw_bytes = raw_output.encode("latin-1", errors="replace")
        printable_ratio = sum(0x20 <= b < 0x7F for b in raw_bytes) / max(len(raw_bytes), 1)

        if printable_ratio < 0.5 and len(raw_bytes) > 8:
            # Binary mode: extract printable ASCII from the byte stream
            lsb_data = _PRINTABLE_RE.sub("", raw_bytes.decode("latin-1", errors="replace"))
        else:
            # Text mode: parse key:value metadata lines
            for line in raw_output.splitlines():
                line_s = line.strip()
                if not line_s:
                    continue
                m = _INFO_LINE_RE.match(line_s)
                if m:
                    info[m.group("key").strip()] = m.group("value").strip()

        # Scan for flags in both parsed values and raw output
        flags_found.extend(_FLAG_PATTERN.findall(lsb_data))
        flags_found.extend(_FLAG_PATTERN.findall(raw_output))
        for v in info.values():
            flags_found.extend(_FLAG_PATTERN.findall(v))

        seen: set[str] = set()
        unique_flags: list[str] = []
        for flag in flags_found:
            if flag not in seen:
                seen.add(flag)
                unique_flags.append(flag)

        return {
            "info": info,
            "lsb_data": lsb_data,
            "flags_found": unique_flags,
            "raw_output": raw_output,
        }

    # ------------------------------------------------------------------
    # High-level shortcut
    # ------------------------------------------------------------------

    async def analyze(self, filepath: str, **kwargs: Any) -> JobResult:
        """Run audio analysis and return a :class:`~sentinel_ctf.core.models.JobResult`.

        Convenience coroutine combining :meth:`build_command`, executor
        dispatch, and :meth:`parse` in a single awaitable call.

        Args:
            filepath: Path to the audio file to analyse.
            **kwargs: Forwarded to :meth:`build_command` (e.g.
                ``analysis_type``).

        Returns:
            A :class:`~sentinel_ctf.core.models.JobResult` whose ``data``
            field contains the parsed audio analysis dictionary.
        """
        command = self.build_command(filepath, **kwargs)
        exec_result: ExecResult = await self.executor.run(command)
        parsed = self.parse(exec_result)
        return JobResult(
            tool=self.name,
            command=command,
            returncode=exec_result.returncode,
            data=parsed,
            flags_found=parsed["flags_found"],
        )
