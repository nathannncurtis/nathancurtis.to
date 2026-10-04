---
title: "The Arrow That Silenced a Service for Eleven Weeks"
date: "October 2026"
readTime: "6 min"
tags: ["Python", "Windows", "Encoding", "Debugging"]
---

In March I wrote about a pair of scripts at the office that classify scanned PDFs and then drive a vendor's old ASP form to send a notification email for each one (the post is "Automating a Vendor's Legacy ASP Form Because There Is No API"). `getList.py` wakes at 7:30, finds yesterday's files, archives the ones that need a notification, writes their work order numbers to a CSV, and launches `emailer.py` to do the form filling.

On May 20 I installed it as a Windows service under NSSM, so it would start at boot and keep running with nobody logged in. From that day until I fixed it on August 5, it did not send a single notification. Seventy-seven days.

The first half kept working. The morning scan found PDFs and archived them into their dated folders, and `processing.log` got a `Copied:` line for every file. The emailer never started.

## The print

This is the function that hands off to the emailer, as it stood on install day:

```python
def launch_emailer_script():
    try:
        print("[\u2192] Launching emailer script...")
        subprocess.Popen([sys.executable, EMAILER_SCRIPT])
    except Exception as e:
        print(f"[!] Failed to launch emailer script: {e}")
```

`\u2192` is a rightwards arrow, →. I used bracketed glyphs as log prefixes all over both scripts: `[+]`, `[!]`, the arrow, a check mark, a camera emoji for screenshots.

In a console window that print works. Python on Windows writes to a console through the Unicode console API, so the arrow comes out whatever the code page is.

Under NSSM, stdout is not a console. The install sets `AppStdout` to a log file, so Python sees a redirected stream, and a redirected stream gets the locale encoding, which on that machine is cp1252. cp1252 has no rightwards arrow. The print raises, the `except Exception` catches it, and the `Popen` on the next line never runs.

I reproduced it on my own machine by running the same function with stdout redirected to a file. This is what lands in the file:

```
[!] Failed to launch emailer script: 'charmap' codec can't encode character '\u2192' in position 1: character maps to <undefined>
```

The message says the launch failed. `Popen` was never called. The print announcing the launch raised first.

## Why the log didn't show it

The try/except is there so a failed launch can't kill the daily loop, and it did that job. The loop kept going, printed `[*] Job complete. Waiting until tomorrow...`, and went back to sleep.

The except did print its failure, and that print succeeded, because the exception text spells the character as the six ASCII characters `\u2192`. So the failure was printed, into a buffer. A redirected stdout is block buffered, and on Python 3.12 the default buffer is 8,192 bytes. On a day with files this script prints six short lines. With the failure message included that's about 350 bytes, so the buffer takes weeks to fill before anything reaches the disk.

My own install guide didn't help. Its verification step says a service in `SERVICE_RUNNING` isn't guaranteed to be doing the right thing, then tells you to open `processing.log` and `nssm_stderr.log` and confirm the second one has no Python traceback. A caught exception doesn't produce a traceback, and the failure line was going to stdout, which that step never opens. The check would have passed on any day of the outage.

## The fix

Two changes. First, both scripts set their own encoding at startup. This is the block in `getList.py`:

```python
# NSSM redirects stdout/stderr to cp1252 log files; non-ASCII prints (the \u2192
# arrow) crash with UnicodeEncodeError without this. That crash silently blocked
# launch_emailer_script for months. line_buffering flushes each print to the log
# immediately instead of sitting in the block buffer for days.
for _stream in (sys.stdout, sys.stderr):
    if _stream:
        _stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
```

`errors="replace"` means a character the stream can't take becomes a `?` instead of an exception. `line_buffering=True` means the log on disk is current as of the last print.

Second, the order:

```diff
 def launch_emailer_script():
     try:
-        print("[\u2192] Launching emailer script...")
         subprocess.Popen([sys.executable, EMAILER_SCRIPT])
+        print("[\u2192] Launched emailer script.")
     except Exception as e:
```

After the reconfigure the print can't fail on encoding, so the reorder looks redundant. I kept it anyway. If a print ever raises for some other reason, it now raises after the work is done.

## The same bug in the emailer

If I had only moved the `Popen`, the emailer would have started and then hit the same thing. It inherits the redirected stdout, and its login block looked like this:

```python
try:
    page.fill('input[name="UserID"]', USERNAME)
    page.fill('input[name="Password"]', PASSWORD)
    print("[✓] Credentials filled directly.")
    page.click('img[name="JS15"]')
    ...
except Exception as e:
    print(f"[!] Login or navigation failed: {e}")
    context.close()
    return
```

The check mark isn't in cp1252 either. That print sits between filling the password and clicking the login button, inside a try whose handler reports every exception as a login failure and exits. I never saw this one fire, because the emailer never ran, but it's the same bug one process further down. `emailer.py` got the same reconfigure block.

## Sending the backlog

The half that worked is what made the backlog recoverable. `getList.py` had kept moving every file that needed a notification into a dated archive folder, so the archive was the list of what the emailer should have sent. Rebuilding the list from it gave 479 work orders.

`emailer.py` now reads an optional `backlog_files.csv` alongside the daily list and skips duplicates. The question was when to mark the backlog as used:

```python
# Consume the backlog only once login has succeeded: a login failure
# leaves it in place for the next run, but a crash mid-batch must not
# re-send the whole backlog tomorrow.
if os.path.exists(BACKLOG_PATH):
    os.replace(BACKLOG_PATH, BACKLOG_PATH + ".done")
```

Rename it before login and an expired session throws the backlog away. Rename it at the end and a crash at row 300 means 300 work orders get a second email the next morning. Renaming right after login avoids both.

The service ran the next morning at 7:30 and sent 493 notifications, the backlog plus that day's own list, with zero failures. The day after that it sent 20.

Every print in both scripts still starts with a glyph in brackets. The arrow is still there. It prints after the `Popen` now.
