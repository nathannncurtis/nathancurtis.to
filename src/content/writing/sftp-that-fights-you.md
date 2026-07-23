---
title: "Delivering To An SFTP Server That Fights You Every Step"
date: "July 2026"
readTime: "6 min"
tags: ["SFTP", "Python", "Reliability"]
---

I built a small delivery pipeline that pushes scanned records and invoices to a client's SFTP server. The server runs CoreFTP on their end, and it does two things that make an uploader's life harder than it should be.

## The server that time forgot

The client's server, when I checked it, only spoke legacy SSH algorithms: `diffie-hellman-group14-sha1` for key exchange, `ssh-rsa` for the host key, `hmac-sha1` for the MAC. Paramiko still ships all three, but it prefers newer ones, so a plain connection can fail negotiation against a server this old. The fix is to grab paramiko's security options off the transport and shove the legacy names to the front of each list before connecting:

```python
if s.get("legacy_algos", True):
    opts = transport.get_security_options()
    for attr, algo in (("kex", "diffie-hellman-group14-sha1"),
                       ("key_types", "ssh-rsa"),
                       ("digests", "hmac-sha1")):
        try:
            setattr(opts, attr, self._prioritize(getattr(opts, attr), algo))
        except ValueError:
            log.warning("installed paramiko does not support legacy "
                        "algorithm — pin paramiko<4", extra={"algo": algo})
```

The `except ValueError` isn't decoration. Paramiko raises `ValueError("unknown cipher")` for any name it doesn't recognize in any of these lists, and paramiko 4.x was in the process of dropping several legacy algorithms outright. That's why `requirements.txt` pins `paramiko<4`. Without the pin, a routine dependency bump silently breaks the connection to a server nobody controls but the client.

## No temp names, ever

The usual safe upload pattern is: write to `name.part`, then rename to `name` once the bytes are all there, so nobody reading the folder ever sees a half-written file. That's what this pipeline did first. Then the client told us their side runs automations that sweep the folder continuously, and those automations must never see a `.part` file. So the upload path had to change to a direct `put()` under the final filename, relying on CoreFTP's write lock on in-progress files to keep a partial file from being read mid-write:

```python
suffix = self.cfg["sftp"].get("temp_suffix", "")
remote_final = posixpath.join(remote_dir, f["filename"])
if suffix:
    remote_tmp = remote_final + suffix
    sftp.put(str(local), remote_tmp)
    sftp.posix_rename(remote_tmp, remote_final)
else:
    sftp.put(str(local), remote_final)
```

`temp_suffix` defaults to empty for this client and stays available for any future target that prefers tmp-then-rename. Reasonable enough, and it shipped.

## The phantom file that got swept

Testing against their actual server, we started seeing 0-byte files under the final name. Here's what was happening: a `put()` that fails partway through (network blip, dropped session, whatever) leaves a partial, sometimes-empty file sitting under the *final* filename, because there's no temp name to catch it. CoreFTP's write lock only protects a file while paramiko is actively writing to it. The moment the connection drops and the write stops, the lock is gone, and the file sits there, complete as far as the filesystem is concerned, garbage as far as the content goes.

Our own retry logic then goes to sleep for a backoff window, 5, 15, or 45 minutes depending on the attempt count, before trying again. That's exactly the window during which the client's sweep automation can walk the folder, find a file under the expected final name, and ingest it as if it were real. We'd handed them a phantom file and gone to sleep.

The fix is a best-effort cleanup in the failure branch, before the backoff timer starts:

```python
except Exception as e:
    try:
        sftp.remove(remote_final + suffix)
    except Exception:
        pass
    backoff = self.cfg.get("retry_backoff_minutes", [5, 15, 45])
    ...
```

`remote_final + suffix` is the detail that matters. When `suffix` is empty (the client's current setup), this removes the bad file under the final name before their automation can find it. When a future target uses a temp suffix, the same expression resolves to the *temp* name instead, and the final name is left untouched, because in that mode the final name might be a previously delivered good copy from an earlier successful run. One line of code has to do the right thing in two different upload strategies, and it does that by just building the path the same way the upload path built it.

The remove is wrapped in its own `try/except: pass` because it's explicitly best-effort: if the connection is already dead (which is often *why* the put failed), the remove will fail too, and that's fine. The retry on the next cycle re-puts the whole file regardless of whether the remnant got cleaned up.

This closed issue #3. The bug never reached a real delivery, since we caught it from the 0-byte files during testing against the actual client server rather than from a client complaint, but it's the kind of bug that only shows up when you stop assuming a failed write leaves nothing behind. On a server where "nothing behind" isn't guaranteed and something else is watching the folder in real time, a failed upload has to clean up after itself before it goes to sleep.
