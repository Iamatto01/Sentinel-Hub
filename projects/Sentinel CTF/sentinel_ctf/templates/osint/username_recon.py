#!/usr/bin/env python3
"""
Sentinel CTF Framework — OSINT Template
========================================
username_recon.py  ·  Username / Person Reconnaissance Script

Checks 20+ major platforms for a username, extracts profile info,
searches for CTF flag patterns, and optionally runs Sherlock.

Usage
-----
    python username_recon.py <username> [--output results.json]
    python username_recon.py john_doe --sherlock --timeout 10

Author  : Sentinel CTF Framework
License : MIT
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import quote

# ---------------------------------------------------------------------------
# Rich console (optional)
# ---------------------------------------------------------------------------
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    from rich import print as rprint

    console = Console(highlight=False)
    RICH = True
except ImportError:
    RICH = False

    class _FallbackConsole:  # noqa: D101
        def print(self, *a, **kw):  # noqa: D102
            text = " ".join(str(x) for x in a)
            text = re.sub(r"\[/?[^\]]+\]", "", text)
            print(text)

        def rule(self, title="", **kw):  # noqa: D102
            print(f"\n{'─'*60}  {title}")

    console = _FallbackConsole()

# httpx is preferred for async support; fall back to requests
try:
    import httpx

    def get(url: str, timeout: int = 10) -> tuple[int, str]:
        """Perform a GET request; return (status_code, body_text)."""
        try:
            r = httpx.get(
                url,
                timeout=timeout,
                follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (compatible; SentinelCTF/1.0)"},
            )
            return r.status_code, r.text
        except Exception as exc:
            return 0, str(exc)

except ImportError:
    try:
        import urllib.request as _urllib
        import urllib.error as _urlerr

        def get(url: str, timeout: int = 10) -> tuple[int, str]:  # type: ignore[misc]
            """Fallback using urllib (no httpx / requests available)."""
            try:
                req = _urllib.Request(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; SentinelCTF/1.0)"},
                )
                with _urllib.urlopen(req, timeout=timeout) as resp:
                    return resp.status, resp.read().decode("utf-8", errors="replace")
            except _urlerr.HTTPError as exc:
                return exc.code, ""
            except Exception as exc:
                return 0, str(exc)

    except Exception:
        console.print("[red]No HTTP library available. Install httpx: pip install httpx[/red]")
        sys.exit(1)

# ---------------------------------------------------------------------------
# Flag regex
# ---------------------------------------------------------------------------
FLAG_REGEX = re.compile(
    r"(?:flag|FLAG|CTF|ctf|HTB|picoCTF|DUCTF|nahamCTF)\{[^}]{3,}\}",
    re.IGNORECASE,
)

# Title extraction
TITLE_REGEX = re.compile(r"<title[^>]*>([^<]{1,200})</title>", re.IGNORECASE)
# Bio / description extraction (og:description or meta description)
BIO_REGEX = re.compile(
    r'<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]{1,300})"',
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Platform definitions
# Each entry: (platform_name, url_template, found_status_codes)
# ---------------------------------------------------------------------------
PLATFORMS: list[tuple[str, str, set[int]]] = [
    ("GitHub",        "https://github.com/{u}",                           {200}),
    ("Twitter/X",     "https://x.com/{u}",                               {200}),
    ("Reddit",        "https://www.reddit.com/user/{u}",                  {200}),
    ("Instagram",     "https://www.instagram.com/{u}/",                   {200}),
    ("LinkedIn",      "https://www.linkedin.com/in/{u}",                  {200}),
    ("HackTheBox",    "https://www.hackthebox.com/user/profile/{u}",      {200}),
    ("TryHackMe",     "https://tryhackme.com/p/{u}",                      {200}),
    ("CTFtime",       "https://ctftime.org/user/{u}",                     {200}),
    ("Pastebin",      "https://pastebin.com/u/{u}",                       {200}),
    ("GitLab",        "https://gitlab.com/{u}",                           {200}),
    ("Docker Hub",    "https://hub.docker.com/u/{u}",                     {200}),
    ("npm",           "https://www.npmjs.com/~{u}",                       {200}),
    ("PyPI",          "https://pypi.org/user/{u}/",                       {200}),
    ("Steam",         "https://steamcommunity.com/id/{u}",                {200}),
    ("YouTube",       "https://www.youtube.com/@{u}",                     {200}),
    ("Twitch",        "https://www.twitch.tv/{u}",                        {200}),
    ("Medium",        "https://medium.com/@{u}",                          {200}),
    ("Dev.to",        "https://dev.to/{u}",                               {200}),
    ("Stack Overflow","https://stackoverflow.com/users/?tab=newusers&search={u}", {200}),
    ("Keybase",       "https://keybase.io/{u}",                           {200}),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def section(title: str) -> None:
    if RICH:
        console.rule(f"[bold cyan]{title}[/bold cyan]")
    else:
        print(f"\n{'─'*60}  {title}")


def info(msg: str) -> None:
    console.print(f"[cyan]ℹ[/cyan]  {msg}" if RICH else f"[INFO] {msg}")


def success(msg: str) -> None:
    console.print(f"[green]✔[/green]  {msg}" if RICH else f"[OK]   {msg}")


def warn(msg: str) -> None:
    console.print(f"[yellow]⚠[/yellow]  {msg}" if RICH else f"[WARN] {msg}")


def error(msg: str) -> None:
    console.print(f"[red]✖[/red]  {msg}" if RICH else f"[ERR]  {msg}")


def found_flag(flag: str, source: str) -> None:
    """Print flag prominently (do not exit — continue scanning other profiles)."""
    if RICH:
        console.print(
            Panel(
                Text(f"  {flag}", style="bold green"),
                title=f"[bold yellow]🚩  FLAG — {source}[/bold yellow]",
                border_style="bright_green",
            )
        )
    else:
        print(f"\n{'='*60}\n  🚩  {flag}  ({source})\n{'='*60}")


def extract_title(html: str) -> str:
    """Extract page title from HTML."""
    m = TITLE_REGEX.search(html)
    return m.group(1).strip() if m else ""


def extract_bio(html: str) -> str:
    """Extract bio/description from HTML meta tags."""
    m = BIO_REGEX.search(html)
    return m.group(1).strip() if m else ""


# ---------------------------------------------------------------------------
# Sherlock
# ---------------------------------------------------------------------------


def run_sherlock(username: str, output_dir: str) -> None:
    """Run Sherlock if available."""
    section("Sherlock — Automated Username Search")
    sherlock_result = output_dir
    try:
        r = subprocess.run(
            ["sherlock", username, "--output", str(Path(output_dir) / f"{username}_sherlock.txt")],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode == 127:
            warn("Sherlock not found. Install: pip install sherlock-project")
            return
        output = r.stdout + r.stderr
        for line in output.splitlines()[:50]:
            console.print(f"    {line}")
        # Check for flags in sherlock output
        m = FLAG_REGEX.search(output)
        if m:
            found_flag(m.group(0), "Sherlock")
    except subprocess.TimeoutExpired:
        warn("Sherlock timed out after 120s")
    except FileNotFoundError:
        warn("Sherlock not found. Install: pip install sherlock-project")
    except Exception as exc:
        warn(f"Sherlock error: {exc}")


# ---------------------------------------------------------------------------
# Manual platform checks
# ---------------------------------------------------------------------------


def check_platforms(username: str, timeout: int) -> list[dict]:
    """Check all platforms for the username; return list of results."""
    section("Platform Enumeration")

    results: list[dict] = []
    found_profiles: list[dict] = []
    flags_found: list[str] = []

    if RICH:
        table = Table(title=f"Username: {username}", show_lines=False)
        table.add_column("Platform", style="cyan", width=18)
        table.add_column("Status", width=8)
        table.add_column("URL", style="dim", width=50)
        table.add_column("Info", width=40)

    for platform, url_tpl, found_codes in PLATFORMS:
        url = url_tpl.format(u=quote(username))
        status, body = get(url, timeout=timeout)

        is_found = status in found_codes and len(body) > 500
        title = extract_title(body) if is_found else ""
        bio = extract_bio(body) if is_found else ""

        # Check for "not found" pages even on HTTP 200
        not_found_phrases = [
            "page not found", "user not found", "doesn't exist",
            "no user", "404", "sorry, this", "this account",
        ]
        if is_found and any(ph in body.lower() for ph in not_found_phrases):
            is_found = False

        entry = {
            "platform": platform,
            "url": url,
            "status": status,
            "found": is_found,
            "title": title,
            "bio": bio[:200] if bio else "",
        }
        results.append(entry)

        if is_found:
            found_profiles.append(entry)
            # Scan body for flags
            m = FLAG_REGEX.search(body)
            if m:
                flags_found.append(m.group(0))
                found_flag(m.group(0), f"{platform}: {url}")
                entry["flag"] = m.group(0)

        if RICH:
            status_str = f"[green]{status}[/green]" if is_found else f"[red]{status}[/red]"
            info_str = (title or bio or "")[:40]
            table.add_row(
                platform,
                status_str,
                url if len(url) <= 50 else url[:47] + "…",
                info_str,
            )
        else:
            status_str = "FOUND" if is_found else "NOT FOUND"
            print(f"  {platform:20s} {status_str:12s} {url}")
            if is_found and (title or bio):
                print(f"    → {(title or bio)[:80]}")

        # Be polite — small delay between requests
        time.sleep(0.3)

    if RICH:
        console.print(table)

    # Summary
    section("Found Profiles Summary")
    if found_profiles:
        success(f"Username '{username}' found on {len(found_profiles)} platform(s):")
        for p in found_profiles:
            console.print(f"    [green]✔[/green] {p['platform']:18s} {p['url']}")
            if p.get("bio"):
                console.print(f"      [dim]{p['bio'][:120]}[/dim]")
    else:
        warn(f"Username '{username}' not found on any checked platform")

    if flags_found:
        section("FLAGS FOUND IN PROFILES")
        for flag in flags_found:
            console.print(f"    [bold green]🚩  {flag}[/bold green]")

    return results


# ---------------------------------------------------------------------------
# Export results to JSON
# ---------------------------------------------------------------------------


def export_json(results: list[dict], username: str, output_file: str) -> None:
    """Save results to a JSON file."""
    data = {
        "username": username,
        "results": results,
        "found_count": sum(1 for r in results if r["found"]),
    }
    Path(output_file).write_text(json.dumps(data, indent=2))
    success(f"Results exported to: {output_file}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Sentinel CTF — Username / OSINT Recon",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("username", help="Username or real name to search")
    p.add_argument("--sherlock", action="store_true", help="Run Sherlock first")
    p.add_argument("--timeout", type=int, default=10, help="HTTP timeout per request (default: 10)")
    p.add_argument(
        "--output", default=None, metavar="FILE",
        help="Output JSON file path (default: <username>_recon.json)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    username = args.username
    output_file = args.output or f"{username}_recon.json"
    output_dir = str(Path(output_file).parent)

    if RICH:
        console.print(
            Panel(
                f"[bold]Username:[/bold] {username}\n"
                f"[bold]Output:[/bold]   {output_file}\n"
                f"[bold]Platforms:[/bold] {len(PLATFORMS)} sites",
                title="[bold yellow]Sentinel CTF · OSINT Username Recon[/bold yellow]",
                border_style="bright_cyan",
            )
        )

    if args.sherlock:
        run_sherlock(username, output_dir)

    results = check_platforms(username, timeout=args.timeout)
    export_json(results, username, output_file)

    section("COMPLETE")
    info(f"Full results saved to: {output_file}")
    info("Manual follow-up:")
    console.print("    • Check Google: site:pastebin.com <username>")
    console.print("    • Check GitHub Gist: https://gist.github.com/<username>")
    console.print("    • Search Google Cache for deleted profiles")
    console.print("    • Run: holehe <email> for email-based OSINT")


if __name__ == "__main__":
    main()
