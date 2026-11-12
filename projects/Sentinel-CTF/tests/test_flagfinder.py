"""
Tests for the flag finder.
"""
from sentinel_ctf.core.flagfinder import scan_text, scan_all


def test_scan_text_finds_flag():
    text = "The answer is flag{hello_world_123} good luck"
    flags = scan_text(text)
    assert "flag{hello_world_123}" in flags


def test_scan_text_no_flag():
    flags = scan_text("nothing interesting here")
    assert flags == []


def test_scan_text_multiple_flags():
    text = "flag{one} and flag{two} were found"
    flags = scan_text(text)
    assert len(flags) == 2


def test_scan_all_aggregates():
    items = ["output: flag{from_stdout}", "note: flag{from_notes}"]
    flags = scan_all(items)
    assert len(flags) == 2


def test_custom_regex():
    text = "CTF{custom_format_here}"
    flags = scan_text(text, flag_regex=r"CTF\{[^}]+\}")
    assert "CTF{custom_format_here}" in flags
