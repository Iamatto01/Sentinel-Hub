"""
sentinel_ctf.tools.misc.exiftool_tool
=======================================
File metadata extraction plugin wrapping ``exiftool``.

Reads EXIF, IPTC, XMP, and other metadata from images, documents, and
miscellaneous binary files.  Particularly useful in CTF forensics /
OSINT challenges where GPS coordinates, author names, timestamps, or
embedded flags are hidden in file metadata.
"""
from __future__ import annotations

import json
import re
from typing import Any

from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.core.models import JobResult

_FLAG_RE = re.compile(
    r"(?:flag|ctf|HTB|picoCTF|DUCTF|RCTF)\{[^}]{1,200}\}",
    re.IGNORECASE,
)

# Key names that typically contain date/time data
_TIMESTAMP_KEYS = {
    "CreateDate",
    "ModifyDate",
    "DateTimeOriginal",
    "FileModifyDate",
    "FileAccessDate",
    "FileInodeChangeDate",
    "GPSDateStamp",
    "TrackCreateDate",
    "TrackModifyDate",
    "MediaCreateDate",
    "MediaModifyDate",
    "MetadataDate",
}

# Camera / device info keys
_CAMERA_KEYS = {
    "Make": "make",
    "Model": "model",
    "CameraModelName": "model",
    "SerialNumber": "serial",
    "LensSerialNumber": "lens_serial",
    "DeviceManufacturer": "make",
    "DeviceModelName": "model",
}

# GPS keys
_GPS_LAT_KEY = "GPSLatitude"
_GPS_LON_KEY = "GPSLongitude"
_GPS_LAT_REF_KEY = "GPSLatitudeRef"
_GPS_LON_REF_KEY = "GPSLongitudeRef"

# Plain-text key:value fallback
_KV_RE = re.compile(r"^(?P<key>[A-Za-z /:]+?)\s*:\s*(?P<value>.+)$")


class ExiftoolTool(BaseTool):
    """
    Extracts and parses file metadata using ``exiftool``.

    JSON output is preferred (``-json`` flag) for reliable structured
    parsing.  If JSON parsing fails the tool falls back to parsing the
    plain-text ``key: value`` output format.
    """

    name: str = "exiftool"
    description: str = "File metadata extraction including GPS, author, timestamps"

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_command(
        self,
        filepath: str,
        tags: str = "",
        **kwargs: Any,
    ) -> str:
        """
        Build the ``exiftool`` command.

        Parameters
        ----------
        filepath:
            Path to the file to inspect.
        tags:
            Optional comma/space-separated tag names to restrict output.
            Each tag name is prefixed with ``-`` (e.g. ``'Author,GPS'``
            becomes ``-Author -GPS``).

        Returns
        -------
        str
            Shell command string.
        """
        tag_flags = ""
        if tags:
            tag_flags = " ".join(f"-{t.strip()}" for t in re.split(r"[,\s]+", tags) if t.strip())

        json_cmd = f"exiftool {tag_flags + ' ' if tag_flags else ''}-json {filepath} 2>/dev/null"
        text_cmd = f"exiftool {tag_flags + ' ' if tag_flags else ''}{filepath} 2>/dev/null"
        return f"({json_cmd}) || ({text_cmd})"

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    def parse(self, result: ExecResult) -> dict[str, Any]:
        """
        Parse exiftool output (JSON-first, text fallback) into structured metadata.

        Returns
        -------
        dict with keys:

        * ``metadata`` – full flat dict of all extracted tags
        * ``gps_coords`` – ``(lat, lon)`` floats or ``None``
        * ``camera_info`` – ``{make, model, serial}``
        * ``timestamps`` – list of date-value strings
        * ``software`` – software string if present
        * ``flags_found`` – CTF flags found in any metadata value
        """
        stdout = result.stdout or ""
        combined = stdout + "\n" + (result.stderr or "")
        flags_found: list[str] = []
        metadata: dict[str, Any] = {}
        gps_coords: tuple[float, float] | None = None
        camera_info: dict[str, str] = {}
        timestamps: list[str] = []
        software = ""

        # ------------------------------------------------------------------
        # Try JSON first
        # ------------------------------------------------------------------
        parsed_json = False
        try:
            data_list = json.loads(stdout.strip())
            if isinstance(data_list, list) and data_list:
                metadata = dict(data_list[0])
                parsed_json = True
        except (json.JSONDecodeError, IndexError, TypeError):
            pass

        # ------------------------------------------------------------------
        # Plain-text fallback
        # ------------------------------------------------------------------
        if not parsed_json:
            for line in stdout.splitlines():
                m = _KV_RE.match(line)
                if m:
                    key = m.group("key").strip().replace(" ", "")
                    value = m.group("value").strip()
                    metadata[key] = value

        # ------------------------------------------------------------------
        # Extract structured fields from metadata
        # ------------------------------------------------------------------
        for raw_key, raw_value in metadata.items():
            # Timestamps
            if raw_key in _TIMESTAMP_KEYS:
                timestamps.append(str(raw_value))

            # Camera info
            if raw_key in _CAMERA_KEYS:
                camera_info[_CAMERA_KEYS[raw_key]] = str(raw_value)

            # Software
            if raw_key.lower() == "software" and not software:
                software = str(raw_value)

            # Scan every value for flags
            value_str = str(raw_value)
            for flag_m in _FLAG_RE.finditer(value_str):
                flag = flag_m.group(0)
                if flag not in flags_found:
                    flags_found.append(flag)

        # Also scan the raw stdout
        for flag_m in _FLAG_RE.finditer(combined):
            flag = flag_m.group(0)
            if flag not in flags_found:
                flags_found.append(flag)

        # GPS coordinates
        lat_raw = metadata.get(_GPS_LAT_KEY, "")
        lon_raw = metadata.get(_GPS_LON_KEY, "")
        if lat_raw and lon_raw:
            try:
                lat = ExiftoolTool.dms_to_decimal(str(lat_raw))
                lon = ExiftoolTool.dms_to_decimal(str(lon_raw))
                # Apply reference direction (S → negative lat, W → negative lon)
                lat_ref = str(metadata.get(_GPS_LAT_REF_KEY, "N")).strip().upper()
                lon_ref = str(metadata.get(_GPS_LON_REF_KEY, "E")).strip().upper()
                if lat_ref == "S":
                    lat = -abs(lat)
                if lon_ref == "W":
                    lon = -abs(lon)
                gps_coords = (lat, lon)
            except (ValueError, AttributeError):
                pass

        return {
            "metadata": metadata,
            "gps_coords": gps_coords,
            "camera_info": camera_info,
            "timestamps": timestamps,
            "software": software,
            "flags_found": flags_found,
        }

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------

    @staticmethod
    def dms_to_decimal(dms_str: str) -> float:
        """
        Convert a DMS (degrees, minutes, seconds) string to decimal degrees.

        Handles formats such as:

        * ``"3 deg 8' 15.50\\" N"``
        * ``"3 deg 8' 15.50\\""``
        * ``"51° 30' 0.00\\" N"``
        * ``"40.7128"`` (already decimal — returned as-is)

        Parameters
        ----------
        dms_str:
            DMS-formatted string.

        Returns
        -------
        float
            Decimal degrees (unsigned; caller applies N/S or E/W sign).

        Raises
        ------
        ValueError
            If the string cannot be parsed.
        """
        dms_str = dms_str.strip()

        # Already decimal?
        try:
            return float(dms_str.split()[0]) if " " not in dms_str or dms_str[0].isdigit() else float(dms_str)
        except ValueError:
            pass

        # Match deg / min / sec pattern
        pattern = re.compile(
            r"(?P<deg>[\d.]+)\s*(?:deg|°|d)?\s*"
            r"(?P<min>[\d.]+)?\s*['\u2019]?\s*"
            r"(?P<sec>[\d.]+)?\s*[\"'']?\s*"
            r"(?P<ref>[NSEWnsew])?"
        )
        m = pattern.search(dms_str)
        if not m:
            raise ValueError(f"Cannot parse DMS string: {dms_str!r}")

        deg = float(m.group("deg") or 0)
        minutes = float(m.group("min") or 0)
        seconds = float(m.group("sec") or 0)

        decimal = deg + minutes / 60.0 + seconds / 3600.0
        return decimal

    # ------------------------------------------------------------------
    # Shortcut
    # ------------------------------------------------------------------

    async def extract(self, filepath: str, **kwargs: Any) -> JobResult:
        """
        High-level shortcut: build → execute → parse → return :class:`JobResult`.

        Parameters
        ----------
        filepath:
            Path to the file whose metadata should be extracted.
        **kwargs:
            Forwarded to :meth:`build_command` and :meth:`BaseTool.run`.
        """
        return await self.run(filepath=filepath, **kwargs)
