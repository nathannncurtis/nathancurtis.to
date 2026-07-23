---
title: "Building a Self-Hosted Obsidian Sync Without a CRDT"
date: "March 2026"
readTime: "7 min"
tags: ["Obsidian", "FastAPI", "TypeScript"]
---

I use Obsidian on three machines and didn't want to pay for their sync service or trust my notes to a Dropbox-flavored folder watcher fighting with the vault's internal state. So I built my own: a FastAPI server that owns the vault on disk, and an Obsidian plugin that talks to it over a WebSocket, with polling as a fallback. No CRDT and no operational transform, just SHA-256 hashes and a last-write-wins rule, because for a single person editing markdown files, that's honestly enough.

## The server side is dumb on purpose

`server/server.py` is 251 lines. It exposes four HTTP routes (`GET /api/files`, `GET /api/file`, `POST /api/file`, `DELETE /api/file`) plus one WebSocket at `/api/ws`. Every file operation is bearer-token authenticated against an `AUTH_TOKEN` environment variable that the app refuses to start without:

```python
AUTH_TOKEN = os.environ.get("AUTH_TOKEN")
if not AUTH_TOKEN:
    raise RuntimeError("AUTH_TOKEN environment variable is required")
```

`GET /api/files` walks the vault directory with `Path.rglob("*")` and returns a path, a SHA-256 hash, and an mtime for every file. That hash is the whole trick: instead of trusting the filesystem's modified time, which drifts across machines, gets rewritten by `rsync`, or just lies, I fingerprint content. If two machines report the same hash for a path, there's nothing to sync, no matter what the mtimes say. I only fall back to mtime comparison to decide *which side wins* when the hashes actually differ.

On top of the HTTP routes, the server runs a background task using the `watchfiles` library's `awatch()` to catch changes made directly on disk (editing a note with vim over SSH, for instance, not through the plugin). Every filesystem event gets debounced 0.5 seconds before it's hashed and broadcast, so a text editor doing three separate writes for one save doesn't turn into three broadcasts.

## The path traversal guard

The plugin sends paths as query strings and form fields, so the server has to assume every path is hostile until proven otherwise. `resolve_safe()` is the one function standing between "sync my notes" and "read arbitrary files off the host":

```python
def resolve_safe(path: str) -> Path | None:
    resolved = (VAULT_PATH / path).resolve()
    if not str(resolved).startswith(str(VAULT_PATH.resolve())):
        return None
    return resolved
```

Join the untrusted path onto the vault root, resolve it (which collapses any `../../etc/passwd` sequences), then check the result is still inside the vault directory. If not, return `None` and every caller treats that as a 400. It's a few lines, but it's the difference between a notes sync tool and an arbitrary file read/write primitive exposed to the internet with just a bearer token in front of it.

## Echo suppression, or: how to not sync a file with itself forever

The genuinely fiddly part of this project wasn't the hashing or the auth, it was making sure the plugin didn't react to its own writes. Here's the loop that will bite you if you don't guard against it: the plugin downloads a remote change and writes it to the local vault file. Obsidian's vault fires a `modify` event because a file changed on disk. The plugin's local-change handler sees that `modify` event and, having no idea it caused it, uploads the file right back to the server. The server broadcasts a change. Every client downloads it again. Forever.

The fix is two `Set<string>` fields on the plugin, `suppressNextRemote` and `suppressNextLocal`, that act as one-shot flags per path:

```typescript
async handleRemoteChange(msg: RemoteChangeMsg) {
	if (shouldIgnore(msg.path)) return;
	if (this.suppressNextRemote.has(msg.path)) {
		this.suppressNextRemote.delete(msg.path);
		return;
	}
	...
```

Before the plugin writes a file that came from the server, it adds the path to `suppressNextLocal`. When Obsidian's `vault.on("modify")` fires immediately after, `handleLocalChange` checks that set first, finds the path, deletes it, and returns without uploading anything. Same pattern in the other direction: before uploading a local change, the path goes into `suppressNextRemote`, and when the server's own broadcast comes back over the WebSocket, it's swallowed once and dropped.

The flag is single-use by design (`.delete()` right after the check), which matters: if I just checked membership without deleting, a *real* subsequent edit to that same path would get silently eaten too.

## Debounce twice, once on each side

Both halves of this system debounce, for different reasons. The plugin's `handleLocalChange` waits 1000ms after the last vault event on a path before it reads, hashes, and uploads, because Obsidian fires `modify` on every keystroke-adjacent save and I don't want a network request per character. The server's file watcher waits 500ms for the same reason, but for changes coming from outside the plugin entirely. Neither debounce knows about the other; they just both exist because "wait a beat before you commit to reacting" turned out to be the right instinct on both ends of the wire, independently.

## Where last-write-wins actually shows up

The whole point of computing a hash on both sides before touching anything is that `initialSync()` only has to make a decision when hashes disagree. When they do, it's a straight mtime comparison, remote timestamp against `localFile.stat.mtime / 1000`, whichever is newer wins, no merge, no conflict file written to disk. That's the entire conflict resolution strategy for a single-owner vault: I'm the only one editing it, just from different laptops, so the failure mode I actually care about is "I edited the same file on two machines while offline," and for that, most-recent-edit-wins is correct often enough that building real CRDT-based merge would have been solving a problem I don't have.

The plugin ships a WebSocket connection with exponential backoff (`reconnectDelay` starts at 5000ms and doubles up to a 60000ms ceiling) and falls back to polling `/api/files` on the configured interval whenever the socket is down. That's the whole reliability story: real-time when connected, poll-and-diff when not, and a content hash that means neither path ever has to guess.
