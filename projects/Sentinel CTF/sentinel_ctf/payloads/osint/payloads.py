"""
sentinel_ctf.payloads.osint.payloads
=====================================
OSINT CTF payloads: username wordlists, dork templates, recon patterns,
platform checkers, metadata extraction hints, GEOINT coordinates.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Username / handle wordlists
# ---------------------------------------------------------------------------
COMMON_USERNAMES: list[str] = [
    "admin", "administrator", "root", "user", "guest", "test", "demo",
    "info", "support", "help", "contact", "service", "web", "mail",
    "ftp", "www", "data", "backup", "dev", "developer", "ops", "devops",
    "security", "sec", "hacker", "h4cker", "ctf", "player", "flag",
    "hax", "r00t", "0x41", "anon", "anonymous", "null", "nobody",
    "sysadmin", "netadmin", "webmaster", "postmaster", "abuse", "noreply",
    "bot", "system", "daemon", "monitor", "api", "app", "srv", "server",
    "oracle", "mysql", "postgres", "redis", "elastic", "kibana",
    "jenkins", "gitlab", "github", "bitbucket", "jira", "confluence",
    "intern", "junior", "senior", "lead", "manager", "cto", "ceo",
    "john", "jane", "alice", "bob", "charlie", "dave", "eve", "mallory",
]

# ---------------------------------------------------------------------------
# Social media / platform username check URLs
# ---------------------------------------------------------------------------
PLATFORM_URL_TEMPLATES: dict[str, str] = {
    "GitHub":       "https://github.com/{username}",
    "GitLab":       "https://gitlab.com/{username}",
    "Twitter/X":    "https://twitter.com/{username}",
    "Instagram":    "https://www.instagram.com/{username}",
    "Reddit":       "https://www.reddit.com/user/{username}",
    "LinkedIn":     "https://www.linkedin.com/in/{username}",
    "HackTheBox":   "https://www.hackthebox.eu/profile/{username}",
    "TryHackMe":    "https://tryhackme.com/p/{username}",
    "CTFtime":      "https://ctftime.org/user/{username}",
    "Pastebin":     "https://pastebin.com/u/{username}",
    "Docker Hub":   "https://hub.docker.com/u/{username}",
    "npm":          "https://www.npmjs.com/~{username}",
    "PyPI":         "https://pypi.org/user/{username}",
    "Steam":        "https://steamcommunity.com/id/{username}",
    "YouTube":      "https://www.youtube.com/@{username}",
    "Twitch":       "https://www.twitch.tv/{username}",
    "Medium":       "https://medium.com/@{username}",
    "Dev.to":       "https://dev.to/{username}",
    "Stack Overflow": "https://stackoverflow.com/users/search?q={username}",
    "Keybase":      "https://keybase.io/{username}",
    "Mastodon":     "https://mastodon.social/@{username}",
    "Telegram":     "https://t.me/{username}",
    "Discord":      "https://discord.com/users/{username}",
    "Spotify":      "https://open.spotify.com/user/{username}",
    "Pinterest":    "https://www.pinterest.com/{username}",
    "Tumblr":       "https://www.tumblr.com/{username}",
    "Flickr":       "https://www.flickr.com/people/{username}",
    "Vimeo":        "https://vimeo.com/{username}",
    "SoundCloud":   "https://soundcloud.com/{username}",
    "Bandcamp":     "https://{username}.bandcamp.com",
    "Bitbucket":    "https://bitbucket.org/{username}",
    "CodePen":      "https://codepen.io/{username}",
    "Replit":       "https://replit.com/@{username}",
    "HackerNews":   "https://news.ycombinator.com/user?id={username}",
    "ProductHunt":  "https://www.producthunt.com/@{username}",
}

# ---------------------------------------------------------------------------
# Google Dork templates
# ---------------------------------------------------------------------------
GOOGLE_DORKS: dict[str, list[str]] = {
    "files": [
        'site:{domain} filetype:pdf',
        'site:{domain} filetype:xls OR filetype:xlsx',
        'site:{domain} filetype:doc OR filetype:docx',
        'site:{domain} filetype:sql',
        'site:{domain} filetype:env',
        'site:{domain} filetype:log',
        'site:{domain} filetype:bak OR filetype:old OR filetype:backup',
        'site:{domain} filetype:conf OR filetype:cfg OR filetype:ini',
        'site:{domain} ext:php intitle:"phpinfo"',
        'site:{domain} ext:git',
    ],
    "login": [
        'site:{domain} inurl:admin',
        'site:{domain} inurl:login OR inurl:signin',
        'site:{domain} inurl:dashboard',
        'site:{domain} inurl:panel',
        'site:{domain} intitle:"login" OR intitle:"sign in"',
        'site:{domain} inurl:wp-admin',
        'site:{domain} inurl:phpMyAdmin',
        'site:{domain} "Password" filetype:log',
    ],
    "sensitive": [
        'site:{domain} "index of /"',
        'site:{domain} inurl:.git',
        'site:{domain} inurl:.env',
        'site:{domain} "not for public"',
        'site:{domain} "confidential"',
        'site:{domain} inurl:config',
        'site:{domain} "api_key" OR "api key" OR "apikey"',
        'site:{domain} "secret" OR "password" filetype:txt',
        'site:{domain} inurl:/proc/self/environ',
    ],
    "tech_stack": [
        'site:{domain} "powered by"',
        'site:{domain} "built with"',
        'site:{domain} intitle:"Welcome to nginx"',
        'site:{domain} intitle:"Apache HTTP Server"',
        'site:{domain} "X-Powered-By: PHP"',
        'site:{domain} "Generator" "WordPress"',
    ],
    "certificates": [
        'site:crt.sh "{domain}"',
        'site:censys.io "{domain}"',
    ],
    "github": [
        'site:github.com "{domain}" password',
        'site:github.com "{domain}" secret',
        'site:github.com "{domain}" api_key',
        'site:github.com "{domain}" credentials',
        'site:github.com "{domain}" token',
        'site:github.com "{domain}" config',
        'site:github.com "{domain}" .env',
        'site:github.com "{username}"',
        'site:github.com "{domain}" filename:.env',
        'site:github.com "{domain}" filename:config.py',
    ],
    "pastebin": [
        'site:pastebin.com "{domain}"',
        'site:pastebin.com "{email}"',
        'site:pastebin.com "password" "{domain}"',
    ],
}

# ---------------------------------------------------------------------------
# Shodan search queries
# ---------------------------------------------------------------------------
SHODAN_QUERIES: dict[str, str] = {
    "open_elasticsearch":    "port:9200 product:elastic",
    "open_mongodb":          "port:27017 product:mongodb",
    "open_redis":            "port:6379 product:redis",
    "open_memcached":        "port:11211 product:memcached",
    "open_cassandra":        "port:9042 product:cassandra",
    "phpmyadmin":            'title:"phpMyAdmin" port:80',
    "jenkins_no_auth":       'title:"Dashboard [Jenkins]" -X-Content-Type-Options',
    "kubernetes_dashboard":  'title:"Kubernetes" port:8001',
    "grafana_open":          'title:"Grafana" port:3000',
    "webcams":               'title:"Network Camera"',
    "printers":              'port:9100 device:printer',
    "vnc_open":              'port:5900 authentication disabled',
    "ftp_anonymous":         'port:21 "220" "230 Login successful"',
    "rdp_open":              'port:3389 os:windows',
    "default_creds_routers": '"default password" title:router',
    "citrix_netscaler":      'title:"Citrix" port:443',
    "fortinet_vpn":          'title:"FortiGate" port:443',
    "spring_actuator":       '"spring.application" port:8080',
    "docker_daemon":         'port:2375 product:docker',
    "jupyter_notebooks":     'title:"Jupyter Notebook" port:8888',
}

# ---------------------------------------------------------------------------
# Email / domain intel sources
# ---------------------------------------------------------------------------
INTEL_SOURCES: dict[str, str] = {
    "WHOIS":       "https://whois.domaintools.com/{domain}",
    "DNS records": "https://dnsdumpster.com/",
    "SSL certs":   "https://crt.sh/?q={domain}",
    "Shodan":      "https://www.shodan.io/search?query={domain}",
    "Censys":      "https://search.censys.io/",
    "VirusTotal":  "https://www.virustotal.com/gui/domain/{domain}/relations",
    "URLScan":     "https://urlscan.io/search/#domain:{domain}",
    "SecurityTrails": "https://securitytrails.com/domain/{domain}/dns",
    "RiskIQ":      "https://community.riskiq.com/search/{domain}",
    "Wayback":     "https://web.archive.org/web/*/{domain}/*",
    "HaveIBeenPwned": "https://haveibeenpwned.com/",
    "Dehashed":    "https://www.dehashed.com/search?query={email}",
    "IntelligenceX": "https://intelx.io/?s={target}",
    "SpyOnWeb":    "http://spyonweb.com/{domain}",
    "BuiltWith":   "https://builtwith.com/{domain}",
    "SimilarWeb":  "https://www.similarweb.com/website/{domain}",
    "GitHub":      "https://github.com/search?q={target}&type=code",
}

# ---------------------------------------------------------------------------
# Metadata fields to check in files
# ---------------------------------------------------------------------------
METADATA_FIELDS_TO_CHECK: list[str] = [
    "Author", "Creator", "Producer", "LastModifiedBy", "Company",
    "Manager", "Template", "Application", "Comment", "Description",
    "Title", "Subject", "Keywords", "Category",
    "GPS Latitude", "GPS Longitude", "GPS Altitude",
    "Camera Make", "Camera Model", "Serial Number", "Lens Model",
    "Software", "CreatorTool", "XMPToolkit",
    "Date Created", "Date Modified", "Date Digitized",
    "Copyright", "Rights", "Source",
    "UserComment", "ImageDescription", "XPComment", "XPTitle",
    "DocumentID", "InstanceID", "OriginalDocumentID",
]

# ---------------------------------------------------------------------------
# Leaked data patterns to search for
# ---------------------------------------------------------------------------
LEAKED_DATA_PATTERNS: list[str] = [
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",  # email
    r"(?:password|passwd|pwd)\s*[:=]\s*\S+",               # password fields
    r"(?:api[_-]?key|apikey)\s*[:=]\s*['\"]?[\w-]{16,}",  # API keys
    r"(?:token|secret|bearer)\s*[:=]\s*['\"]?[\w.-]{16,}", # tokens
    r"(?:aws_access_key_id|AWS_ACCESS_KEY_ID)\s*=\s*\w+",  # AWS keys
    r"AKIA[0-9A-Z]{16}",                                    # AWS access key
    r"sk-[a-zA-Z0-9]{32,}",                                # OpenAI / Stripe keys
    r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----",            # private keys
    r"ssh-rsa AAAA[0-9A-Za-z+/]{100,}",                   # SSH public key
    r"[0-9a-f]{32}:[0-9a-f]{32}",                          # NTLM hash
    r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}",                # bcrypt
    r"[0-9a-f]{64}",                                        # SHA-256 hex
    r"(?:flag|ctf|HTB|picoCTF)\{[^}]+\}",                  # CTF flags
    r"(?:mongodb|postgresql|mysql|redis)://[^\s\"']+",      # connection strings
    r"ghp_[0-9a-zA-Z]{36}",                                # GitHub PAT
    r"glpat-[0-9a-zA-Z-]{20}",                             # GitLab token
]


class OsintPayloads:
    """OSINT helpers and payload generators."""

    @staticmethod
    def get_dorks(domain: str, category: str = "all") -> list[str]:
        """Return Google dorks for a domain."""
        if category == "all":
            dorks = []
            for cat_dorks in GOOGLE_DORKS.values():
                dorks.extend(cat_dorks)
        else:
            dorks = GOOGLE_DORKS.get(category, [])
        return [d.replace("{domain}", domain) for d in dorks]

    @staticmethod
    def get_platform_urls(username: str) -> dict[str, str]:
        """Return all platform check URLs for a username."""
        return {
            platform: url.replace("{username}", username)
            for platform, url in PLATFORM_URL_TEMPLATES.items()
        }

    @staticmethod
    def get_intel_urls(domain: str = "", email: str = "", target: str = "") -> dict[str, str]:
        """Return all intel source URLs for a target."""
        result = {}
        for source, url in INTEL_SOURCES.items():
            result[source] = url.replace("{domain}", domain).replace(
                "{email}", email).replace("{target}", target or domain)
        return result

    @staticmethod
    def extract_emails(text: str) -> list[str]:
        """Extract email addresses from text."""
        import re
        return list(set(re.findall(
            r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text
        )))

    @staticmethod
    def extract_domains(text: str) -> list[str]:
        """Extract domain names from text."""
        import re
        return list(set(re.findall(
            r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b", text
        )))

    @staticmethod
    def extract_ips(text: str) -> list[str]:
        """Extract IPv4 addresses from text."""
        import re
        return list(set(re.findall(
            r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}"
            r"(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b", text
        )))

    @staticmethod
    def check_leaked_data(text: str) -> list[dict]:
        """Scan text for patterns of leaked/sensitive data."""
        import re
        results = []
        for pattern in LEAKED_DATA_PATTERNS:
            matches = re.findall(pattern, text)
            for m in matches:
                results.append({"pattern": pattern, "match": m})
        return results
