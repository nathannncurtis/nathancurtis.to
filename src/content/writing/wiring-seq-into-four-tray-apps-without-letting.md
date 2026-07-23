---
title: "Wiring Seq Into Four Tray Apps Without Letting Logging Ever Block Them"
date: "April 2026"
readTime: "5 min"
tags: ["Python", "Logging", "Windows"]
---

Four of my internal Windows apps had local log files nobody read until something already broke. Someone would hit a bug, I'd remote in, find the machine, find the log, and read it after the fact. There was no way to search across machines, no way to see "how many times did this fail this week across the fleet," nothing until you were already standing in front of the one computer that had the answer.

The fix was to add Seq as a second logging sink. The constraint was that it could not be allowed to touch the first one.

## The rule: file logging is truth, Seq is a bonus

Each app already had a `RotatingFileHandler` at 5 MB times 3 backups, writing to a per-app log file at install. That behavior had to survive completely unchanged. If Seq's server were unreachable, misconfigured, or just not installed on a given machine, the app needed to behave exactly as it did before this change: no warnings, no startup probe, no different code path. So `setup_logging()` reads a small JSON config at `%LOCALAPPDATA%\<Vendor>\logging.json` for a `seq_url`. If the file is missing, malformed, or the URL is empty, it returns silently and the app is back to file-only, same as every version before it.

```python
def _read_seq_config() -> tuple[Optional[str], Optional[str]]:
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None, None

    url = (cfg.get("seq_url") or "").strip() or None
    api_key = (cfg.get("seq_api_key") or "").strip() or None
    return url, api_key
```

Three failure modes collapsed into one return value. Nobody downstream has to check which one happened.

## Non-blocking means a queue, not a thread per call

The naive version of "ship logs to a server" is to have the Seq handler make an HTTP call on the same thread that just logged something. That's fine until the server is slow or down, at which point every `logger.info()` in the app blocks on a socket. For a tray app that's supposed to be idle 99% of the time, that's not acceptable.

The fix is the stdlib's own answer to this: `QueueHandler` puts the log record on an in-memory queue and returns immediately. A `QueueListener` running on its own thread drains the queue and is the only thing that ever touches the Seq handler. If Seq is slow, the queue backs up (bounded at 1000 records by default) and new records get dropped once it's full. The local file handler isn't on that queue at all, so it never notices or cares.

## Shutting down without waiting forever

The harder problem was shutdown. `QueueListener.stop()` joins its worker thread, and if that thread is mid-HTTP-request to a Seq server that's hanging rather than failing fast, `.stop()` hangs with it. For the short-lived helper scripts (the setup helper, the uninstall helper, the update checker) that run for a second and exit, a hung shutdown means the installer itself hangs.

The fix wraps the listener's stop call in its own daemon thread and joins that with a timeout:

```python
def _bounded_stop(listener, timeout: float = 2.0) -> None:
    stopper = threading.Thread(target=listener.stop, daemon=True)
    stopper.start()
    stopper.join(timeout=timeout)
```

After two seconds, whatever is stuck gets abandoned and the process exits anyway. The daemon flag means the OS reaps it. Losing the last few queued Seq events on a hung shutdown is an acceptable trade; losing an installer to a frozen HTTP call is not.

Short-lived scripts use this through a context manager, `with setup_logging(...) as h:`, so the flush happens on the way out no matter how `main()` returns. Long-running apps call `.shutdown()` in a `finally` block around the tray's event loop.

## Every record gets three fields it didn't have before

A `logging.Filter` subclass stamps `app_name`, `hostname`, and `username` onto every record before it reaches any handler, file or Seq. That's what turns "an error happened" into "this error happened on this machine, in this app, for this user," searchable across the whole fleet instead of grep'd out of one file at a time. Existing `logger.info("some message")` calls needed no changes to pick this up. New call sites can go further with the stdlib's own `extra={}` argument, `logger.info("PDF processed", extra={"path": path})`, and those fields become filterable properties in Seq without inventing any new logging API.

## What shipped

The module itself carries a version number independent of the four apps that vendor it, bumped on every change so a drifted copy is identifiable by grepping deployed builds later. `seqlog` failure callbacks got silenced separately, since by default it writes an HTTP traceback to stderr on every failed batch, which is its own kind of noise nobody asked for. Batch size and flush timeout differ for short-lived processes (`batch_size=1`, half-second flush) versus long-running ones (`batch_size=10`, two-second flush), because a helper that exits in under a second can't wait around for a batch to fill.

Four apps got a second set of eyes on their logs without a single line of existing logging code having to change, and without the file handler that had always been the source of truth losing that role for a moment.
