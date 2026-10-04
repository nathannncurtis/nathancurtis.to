---
title: "Tests That Pass Against the Broken Code"
date: "October 2026"
readTime: "10 min"
tags: ["Python", "Testing", "Code Review"]
---

The office is building an upload portal for the people who send us records. Before it went anywhere near a real machine, I put six security fixes through review as six pull requests: admin panel hardening, authentication on the staff page, proxy header trust, the renderer's container mounts, upload disk quotas, password detection. Each PR was reviewed in rounds, and it wasn't done until a round came back clean. The admin panel PR was clean in three rounds. Four of the six went past round twelve, and the quota PR didn't come back clean until round 17.

Some of those rounds found real holes in the fixes. The finding that kept coming back was about the tests: review would take a control the PR had added, delete it or break it, run the suite, and watch everything pass.

## A guard that was a comment

The admin panel PR put a CSRF check on every POST route, and added one structural test so nobody could add a route later without one:

```python
src = inspect.getsource(admin_app)
routes = re.findall(r'@app\.post\("([^"]+)"[^)]*\)\s*(?:async\s+)?def\s+(\w+)', src)
assert len(routes) >= 14, f"expected the full POST surface, found {len(routes)}"
...
for path, body in bodies.items():
    if path == "/login":
        assert "csrf_ok(request, csrf)" in body, "login lost its CSRF check"
    else:
        assert "csrf_rejected(request" in body, f"POST {path} has no CSRF guard"
```

That test was the only coverage for 8 of the 14 routes. Review fooled it four ways against mutated copies of the module. A route declared with single quotes was invisible to the regex. So was a route with a second decorator. A guard replaced by a comment that mentioned `csrf_rejected` passed, because the check was a substring match on source text. A guard called with its return value thrown away, which does nothing, passed too. The `>= 14` bound absorbed any route the regex skipped.

The replacement enumerates routes from the router and walks each handler's AST. A guard only counts if it is an `if` that calls the helper in its test and returns or raises in its body, and it has to come before the first write. The route count is an exact constant. Then the sweep got its own test, fed the shapes that fooled the first version:

```python
commented = ast.parse(
    "def handler(request, csrf=''):\n"
    "    # csrf_rejected(request, csrf) -- TODO\n"
    "    db.execute('DELETE FROM admin_users')\n"
).body[0]
assert _guard_line(commented) is None
```

The AST version got fooled as well, in round three. It used `ast.walk` over the guard's body, so a `return` buried under `if False:` counted as a guard that returns.

## Delete the line, run the suite

The staff page audited failed unlocks, and under a flood it collapsed them into summary rows saying how many events came from how many addresses. The address count came from this loop:

```python
prefix = f"{kind}_audit:"
for bucket, n in _suppressed.items():
    if n and bucket.startswith(prefix):
        addresses += 1
        _suppressed[bucket] = 0
```

Delete `bucket.startswith(prefix)` and all 344 tests passed. That clause was the only thing making the count per-action. The map was shared by three audited actions, so without it a drain of one action counted the others' addresses and zeroed them.

The suite couldn't see it because no test file drove two audited actions at once. One file only produced rejected API keys, another only failed unlocks. Production gets two from one ordinary guessing run: the first ten wrong passwords from an address are audited as failures, and everything after that as throttled. The test that pinned it was that run, 21 wrong passwords from one address and then one from a second, through the real HTTP path. With the guard gone, one address read as two on the first summary row, and a genuine two-address run read as one on the next. The test also asserted the order the summary rows landed in, so it would fail if the workload drifted and the interleaving it depended on went away.

The quota PR had a smaller one. The free-space bound covers four volumes named in a tuple. Review cut the tuple to two and the run still came back 129 passed, because the only test of the tuple looped over the tuple itself, so it passed for any value. The fix pins the contents:

```python
assert set(config.UPLOAD_VOLUME_PATHS) == {
    "tusd_data_dir",
    "staging_path",
    "quarantine_path",
    "quarantine_pages_path",
}, "the free-space bound would cover less than it says it does"
assert len(config.UPLOAD_VOLUME_PATHS) == 4, "a leg is named twice"
```

## Tests that can't reach the code

The staff page would have shipped dead. In production the public URL is https, so its cookies were issued with the Secure flag. Clerks reach that page over plain HTTP through a tunnel, so the browser would drop the cookie and the correct password would come back, every time, as a 403 reading "That form expired. Try again." 301 tests passed over it. The reason was one line:

```python
COOKIE_SECURE = settings.public_base_url.startswith("https://")
```

That is a module constant, evaluated at import from the default localhost URL. It was false in every test, and no test ran the flow with an https base URL. It's `cookie_secure()` now, read at call time, and the staff page has its own setting.

The proxy-trust PR had the harness version of this. When `client_ip()` stopped reading `X-Forwarded-For`, seven existing tests failed, because they had been setting that header to pretend to be different clients, which is the capability the PR existed to remove. The rewritten fixture wraps the app in the production wiring and dials from the trusted proxy:

```python
with TestClient(
    ProxyHeadersMiddleware(fastapi_app, trusted_hosts=TRUSTED_PROXY),
    follow_redirects=False,
    client=(TRUSTED_PROXY, 44000),
) as c:
    yield c
```

The admin PR had the same gap from the other side. It had a test that forged the header and showed the login throttle ignoring it. `TestClient` drives the ASGI app directly and never installs uvicorn's proxy middleware, which the served app gets by default, so the test passed without saying anything about the stack that would be serving.

## Passing for the wrong reason

The renderer writes and reads a manifest with `O_NOFOLLOW`, and a test plants a symlink where the manifest should be and asserts that `read_manifest` returns `None`. The symlink pointed at a file holding `SQLite format 3 -- secrets`. Those bytes aren't JSON, so the parse fails and the function returns `None` whether or not the link was followed.

There was a second reason nobody saw it. The test skips on Windows, where I develop, because an unprivileged process can't create symlinks there. It turned up when `O_NOFOLLOW` was reverted on the CI runner and the read side failed one test where the write side had failed two. The plant now points at a valid manifest, and the fixture asserts that the target parses before the assertion that depends on it.

A later pin in the same PR had the same problem. It could only run where symlinks are creatable, so it skipped on my machine and its mutant survived without anyone seeing it. I deleted the test and left a comment in its place.

## The matrix that ran on the wrong commit

By the middle rounds each fix came with a mutation matrix: a list of named one-line breakages and, for each, the tests that fail. Round 11 of the proxy PR had one with 42 mutations. Round 12's review diffed the tree that matrix had been run on and found it byte-identical to `1916ebc`, the commit before the PR head. None of the 42 had been run against the head. Re-extracted and re-run with four more added, 45 of 46 were caught. The survivor's test depends on `chmod(0)`, which is a no-op on that filesystem, so the test skips itself there.

After that, review checked its export against the head byte for byte before trusting any count, and stopped carrying numbers forward from earlier rounds.

The staff PR produced the other habit. A mutation that survives because it can't matter gets declared: named in the commit message and in a comment beside the code, with the argument for why. That matrix ended at 30 of 32 caught, with two declared survivors.

## The config nobody had parsed

All twelve PRs merged (the six had grown to twelve by then), and main went from 272 tests to 1,179. Two days later I added a CI step that builds the Caddy image and runs `caddy validate` on the Caddyfile. It failed on the first run:

```
Error: adapting config using caddyfile: parsing caddyfile tokens for 'tls': wrong argument count or unexpected line ending after '{env.DESEC_TOKEN}', at /etc/caddy/Caddyfile:50
```

The DNS plugin takes its token in a nested block, and the file had carried the inline form since the day it was written:

```diff
 	tls {
-		dns desec {env.DESEC_TOKEN}
+		dns desec {
+			token {env.DESEC_TOKEN}
+		}
 		resolvers 1.1.1.1
 	}
```

Caddy reads its config once, at start. The first deploy would have come up with no TLS and nothing answering on 80 or 443, and the error would have been in one container's log. There was a whole test module for that file, covering the trust settings that several rounds of review had argued over. Every test in it read the file as text.

So I did the same for the other files that had only ever been read as text. `docker compose config` went into CI and came back clean. A test that loads every launchd plist with `plistlib` did not: one had `--` inside an XML comment, which is a well-formedness error. That plist was the deploy poller's. launchd would have refused to load it, with no failing service and no log line, and the box would have sat on its first release.

The merge itself produced one more. One PR added a sweep to the hourly cleanup job that read a local called `stale_cutoff`. Another rewrote the step above it and deleted that local. The edits were far enough apart that git merged them without a conflict, into a `NameError` on every run of the job. No test covered the call, so the suite passed over it. It was fixed during the rebase, in one line:

```python
_sweep_strip_scratch(time.time() - 24 * 3600)
```

Main gained 907 tests in that merge. The step that caught the Caddyfile is seven lines of YAML: build the image, run `caddy validate`.
