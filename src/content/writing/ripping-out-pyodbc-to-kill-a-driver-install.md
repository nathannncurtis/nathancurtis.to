---
title: "Ripping Out pyodbc to Kill a Driver-Install Dependency Accidentally Fixed a Query Timeout Too"
date: "June 2026"
readTime: "5 min"
tags: ["Python", "SQL Server", "Windows", "Production"]
---

I maintain a small Windows tray app that watches a handful of tracked orders in the office's production SQL Server database and pings me when their status notes change. It's read-only, it's scoped to a few dozen rows at a time, and it's about as low-stakes a piece of software as I've written. Which is exactly why I noticed the driver problem: it kept showing up on machines that had never needed anything special before.

## The dependency I was trying to kill

The backend talked to SQL Server through `pyodbc`. `pyodbc` doesn't ship a driver, it just wraps whatever ODBC driver is already installed on the machine. My connection code looked for "ODBC Driver 18 for SQL Server" or "ODBC Driver 17 for SQL Server" and, if neither was present, raised on purpose:

```python
def _driver():
    drivers = pyodbc.drivers()
    for preferred in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
        if preferred in drivers:
            return preferred
    raise RuntimeError(
        "No modern SQL Server ODBC driver found (need ODBC Driver 17 or 18).")
```

That "fail loud" was deliberate. The alternative was a silent fallback to the legacy `SQL Server` driver, which logs in unencrypted, and I'd rather have an obvious error than a quiet security downgrade. But the error was still an error, and it kept happening on installs where nobody had thought to run the ODBC driver installer first. Every new machine meant a manual step before the app could reach the database at all.

The fix was to stop needing the machine's ODBC layer in the first place. `pymssql` bundles its own TDS client, so it talks to SQL Server directly without touching whatever's installed on the host. I already had a sibling tool at the office built the same way, so I knew the approach worked; I just hadn't gotten around to porting this one.

## Swapping drivers meant swapping how parameters get sent

The mechanical part of the port was straightforward: build a connection string differently, since `pymssql.connect()` wants `server` and `port` as separate arguments instead of pyodbc's `SERVER=host,port` string.

```python
def _split_host_port(host, default_port=1433):
    """pymssql takes server + port separately; our host is stored as 'host,port'
    (the pyodbc SERVER= form). Split it back."""
    h = (host or "").strip()
    port = default_port
    if "," in h:
        h, p = h.rsplit(",", 1)
        try:
            port = int(p.strip())
        except ValueError:
            pass
    return h.strip(), port
```

And cursors: pyodbc rows are objects with attribute access (`row.WorkOrder`), pymssql rows are dicts when you open the cursor with `as_dict=True` (`row["WorkOrder"]`). Every query function in `queries.py` needed that find-and-replace, along with swapping `?` placeholders for `%s`.

None of that worried me. What worried me was a bug I'd already fixed once and didn't want to fight again.

## The timeout I was bracing to refight

The database's key columns, including the `WorkOrder` column every query filters on, are `char`, not `nvarchar`. Months earlier, on pyodbc, I'd hit a real production problem: pyodbc sends Python strings as `NVARCHAR` parameters by default, and SQL Server won't use a clustered index seek to match an `NVARCHAR` parameter against a `char` column. It converts the column instead, which means a full scan. On this table, that scan meant a 10-second query timeout. The fix was one line, `conn.setencoding(encoding="utf-8", ctype=pyodbc.SQL_CHAR)`, which forced parameters to go over as `SQL_CHAR` and dropped the same query from a 10-second timeout to 0.08 seconds.

Swapping the driver meant that fix was gone. `pymssql` has no `setencoding` call, and I fully expected to spend an afternoon finding whatever its equivalent knob was, or worse, discovering there wasn't one. Instead, testing the new code path against the same query showed the seek was already happening. It turns out `pymssql` substitutes `%s` parameters client-side as non-Unicode `varchar` literals by default, which is exactly the behavior I'd had to force by hand in pyodbc. The driver swap I made purely to kill an install-time dependency also, incidentally, closed off a class of query-timeout regression I would otherwise have had to reintroduce a workaround for.

I didn't take that on faith. The docstring in `connection.py` now says "verified live" next to that claim, because I checked it against the real table before writing the comment, not just the pymssql documentation.

## What shipped

`requirements.txt` dropped `pyodbc>=5.0` for `pymssql>=2.3.0`. The startup diagnostic that used to log which ODBC drivers were visible on the machine now logs the bundled `pymssql` version instead, since there's no longer a driver to be missing. And the Electron launcher's comment, which used to explain that the backend needed "pyodbc + the system ODBC driver," now just says the backend bundles its own TDS client. Five files changed, 82 lines added, 77 removed, and one fewer manual setup step on every machine this app gets installed on.
