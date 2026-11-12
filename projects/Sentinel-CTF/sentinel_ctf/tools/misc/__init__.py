"""Misc tools: QR decoder, audio analyzer, multi-decoder.

This sub-package groups miscellaneous CTF utility tools that do not fit
cleanly into the forensics, reversing, or OSINT categories:

* :class:`~sentinel_ctf.tools.misc.qr_tool.QrTool`
  — QR code and barcode decoder using ``zbarimg`` / ``pyzbar``.
* :class:`~sentinel_ctf.tools.misc.audio_tool.AudioTool`
  — Audio steganography analysis (spectrogram metadata, LSB, Morse).
"""

from sentinel_ctf.tools.misc.qr_tool import QrTool
from sentinel_ctf.tools.misc.audio_tool import AudioTool

__all__ = [
    "QrTool",
    "AudioTool",
]
