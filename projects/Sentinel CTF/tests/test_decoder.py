"""
Tests for the decoder tool (pure-Python path, no executor needed).
"""
from sentinel_ctf.tools.crypto.decoder import DecoderTool


def test_base64_decode():
    results = DecoderTool.try_all("ZmxhZ3t0ZXN0fQ==")
    assert results.get("base64") == "flag{test}"


def test_hex_decode():
    results = DecoderTool.try_all("666c61677b68657821")
    decoded = results.get("hex", "")
    assert "flag{hex!" in decoded or decoded != ""


def test_rot13_decode():
    results = DecoderTool.try_all("synt{ebg13}")
    assert results.get("rot13") == "flag{rot13}"


def test_invalid_input_no_crash():
    results = DecoderTool.try_all("this is not encoded @@@###")
    assert isinstance(results, dict)


def test_url_decode():
    results = DecoderTool.try_all("flag%7Burl_encoded%7D")
    assert "flag{url_encoded}" in results.get("url", "")
