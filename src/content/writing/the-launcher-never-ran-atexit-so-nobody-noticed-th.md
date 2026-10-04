---
title: "The Launcher Never Ran atexit, So Nobody Noticed the Logger Could Hang Forever"
date: "October 2026"
readTime: "8 min"
tags: ["Python", "Logging", "Fleet Deployment"]
---

In April I wrote a post called "Wiring Seq Into Four Tray Apps Without Letting Logging Ever Block Them." Its claim was that Seq, the second logging sink on four of my Windows tray apps at the office, could never block the app: a `QueueHandler` in front, a listener thread behind it, and a shutdown that gave up after two seconds. This post corrects that one. The logging module could hold a process open at exit for as long as the Seq server kept a socket waiting, and the only reason it never did was how the exes were built.

## Why it never showed

The apps are bundled with Coil, my own Python bundler. Before 0.3.0, a Coil exe was a renamed `pythonw.exe` that called `os._exit()` as soon as the app's code returned. The process was gone before `atexit` ran. Coil 0.3.0 replaced that with a native launcher that shuts the interpreter down normally, and on September 5 I moved the fleet's update agent onto it. That's two bundles: the agent, and the launcher that starts it at logon.

Normal shutdown means `atexit` runs `logging.shutdown()`. That function walks every handler still alive in the process and, on the exiting thread, calls `flush()` and then `close()` on each one. The Seq handler's flush ends up here, in seqlog:

```python
response = self.session.post(
    self.server_url,
    data=request_body_json,
    headers={'Content-Type': "application/vnd.serilog.clef" if self._use_clef else 'application/json'},
    stream=True  # prevent '362'
)
```

There is no `timeout` argument, and without one `requests` waits as long as the socket does. My two-second bound from April only wrapped `QueueListener.stop()`. It did nothing about a second flush that the interpreter runs after my code has returned.

I measured it on a built 0.3.0 `launcher.exe` with the Seq URL pointed at an unroutable address: 21.2 seconds to exit. That launcher runs at every logon. The same module is in the setup helper the installer waits on, and in the agent exe that self-update has to replace. Each of them would have stalled at exit, on every workstation, for as long as Seq was down.

## Fix one: a timeout on every request

Version 0.1.6 of the module made two changes. The first puts a default timeout on the session seqlog uses, 3.05 seconds to connect and 5 to read, by wrapping `Session.request`, which `Session.post` goes through:

```python
_SEQ_HTTP_TIMEOUT = (3.05, 5.0)

def _bound_session_timeout(session, timeout=_SEQ_HTTP_TIMEOUT) -> None:
    try:
        original = session.request

        def request_with_timeout(*args, **kwargs):
            kwargs.setdefault("timeout", timeout)
            return original(*args, **kwargs)

        session.request = request_with_timeout
    except Exception:
        pass
```

The second moved more work onto the time-bounded thread. After stopping the listener it removed the queue handler from the root logger, then flushed and closed the Seq handler, so that the `atexit` pass would find nothing of mine left to ship.

Same launcher, same unroutable Seq: 3.3 seconds. I wrote tests for it, started copying the module into the other apps that vendor it, and considered the exit path bounded.

## Eleven installs that failed after succeeding

Two days later, on September 7, I pushed an update to the fleet. Eleven machines reported the install as failed. All eleven had installed fine.

On each of them the setup helper finished its work, left its `with setup_logging(...)` block, and then sat in the interpreter's exit pass. The agent gives an installer 300 seconds. The helper was still sitting there at 300 seconds, so the agent killed the installer that was waiting on it and recorded a failure.

Seq wasn't down that day. It was slow, with twenty machines hitting it at once, and I hadn't tested slow. An unroutable address fails once, at connect. A slow server accepts every connection and then takes its time, so every request gets to spend its own timeout.

I reproduced it locally against a stub Seq that takes six seconds to answer. A short-lived process left its with-block in two seconds, which was the bound, and then did not exit for over 150 seconds.

I had two things wrong.

Detaching the handler from the logger doesn't hide it from `logging.shutdown()`. The logging module keeps its own module-level list of weak references to handlers, and shutdown walks that list:

```python
def shutdown(handlerList=_handlerList):
    for wr in reversed(handlerList[:]):
        try:
            h = wr()
            if h:
                try:
                    h.acquire()
                    if getattr(h, 'flushOnClose', True):
                        h.flush()
                    h.close()
```

The Seq handler was still alive, so it got flushed again, on the exiting thread, with everything the bounded thread hadn't managed to send.

And the timeout I had added was per request. Short-lived processes were configured with `batch_size=1`, which I'd chosen in April so a helper that exits in under a second would still get its events out. That meant one record per request, with each request allowed its full timeout against a server that was answering slowly. A timeout on each request puts no limit on how long the whole flush takes. Twenty records against a slow Seq is minutes.

## Fix two: retire the handler

In 0.1.6 I tried to arrange things so the exit pass would have nothing to do. Version 0.1.8 doesn't depend on that. After the bounded drain, whatever it managed, `shutdown()` turns the handler into something that can't block, and does it on the calling thread:

```python
def _retire_handler(handler) -> None:
    if handler is None:
        return
    noop = lambda *a, **k: None  # noqa: E731
    for name in ("flush", "close", "emit", "handle", "acquire", "release"):
        try:
            setattr(handler, name, noop)
        except Exception:
            pass
    try:
        handler.setLevel(logging.CRITICAL + 1)
    except Exception:
        pass
```

`logging.shutdown()` can still find the handler in its weak list. Every method it calls on it now returns immediately. So does a late `logger.info()` from some other `atexit` hook.

The drain bound went from 2 seconds to 4, and the short-lived settings flipped:

```python
-            batch_size=1 if short_lived else 10,
-            auto_flush_timeout=0.5 if short_lived else 2.0,
+            batch_size=200 if short_lived else 10,
+            auto_flush_timeout=None if short_lived else 2.0,
```

A setup helper logs a couple of dozen records. They now go as one request at shutdown, so the 4-second bound can deliver them when Seq is healthy. When Seq is slow those events are lost, and the local log file still has all of them.

## The extra fields never reached Seq

The April post has a second error, fixed the same afternoon as 0.1.6. I wrote there that `logger.info("PDF processed", extra={"path": path})` makes `path` a filterable property in Seq. It doesn't. seqlog takes a record's named properties from one attribute:

```python
if hasattr(record, 'log_props'):
    # assume record is StructuredLogRecord
    for prop_name in record.log_props.keys():
        event_data["Properties"][prop_name] = record.log_props[prop_name]
```

`log_props` is set by seqlog's own `StructuredLogger`. The stdlib logger puts `extra` keys straight onto the record as attributes and never sets it. So every `extra={...}` in these apps reached the file formatter, which is `%(asctime)s - %(levelname)s - %(name)s - %(message)s` and drops them, and went nowhere else.

The enricher's `app_name`, `hostname` and `username` were plain record attributes too, so they weren't Seq properties either, and the April post called them searchable across the whole fleet. The app name and username showed up in Seq only because a separate filter prepends them to the message text. Six posts on this site, the April one included, have `extra={...}` in their code.

Version 0.1.7 adds a filter on the Seq queue handler that packs every non-standard record attribute into `log_props`:

```python
_STANDARD_RECORD_ATTRS = frozenset(
    vars(logging.LogRecord("", logging.INFO, "", 0, "", (), None))
) | {"message", "asctime", "log_props", "_seq_decorated"}

def seq_properties(record: logging.LogRecord) -> dict:
    props = {}
    for name, value in vars(record).items():
        if name in _STANDARD_RECORD_ATTRS or name.startswith("_") or callable(value):
            continue
        props[name] = _seq_safe(value)
    return props
```

`_seq_safe` reduces each value to JSON types (a `Path`, a set, bytes and an exception all become strings or lists) and cuts strings at 8,000 characters. If building the properties raises, the filter swallows it and the event ships without them.

## The test

The 0.1.6 tests ran against a fake Seq handler inside the test process, so none of them went through a real interpreter exit. The 0.1.8 test starts a real child process against a stub that sleeps six seconds per request, logs twenty records, and asserts the child is gone within fifteen seconds:

```python
assert elapsed < 15, f"process took {elapsed:.1f}s to exit: {out}"
```

Before the change that child took minutes.
