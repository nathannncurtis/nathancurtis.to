---
title: "Zero-Downtime Rolling Deploys For A Two-Replica PHP App"
date: "June 2026"
readTime: "6 min"
tags: ["Docker", "Deployment", "Caddy"]
---

## The deploy that took the whole app down for a second

The office runs an internal staff intranet: PHP 8.4, SQLite in WAL mode, two identical Apache replicas behind a Caddy reverse proxy, round-robin with health-check failover. On paper that's a small HA setup. In practice the deploy script undid the HA part every time it ran.

The workflow was three lines: `docker compose pull`, `docker compose up -d --remove-orphans`, then a force-recreate of Caddy so it would pick up any Caddyfile change. The problem is that `app1` and `app2` use the same image tag. When that tag changes, `up -d` recreates both containers in the same breath. For the few seconds it takes the new containers to start Apache, Caddy has zero healthy backends and every request 502s. Two replicas bought us nothing during the one moment they mattered.

## The fix that didn't fix it

I'd actually already tried to solve half of this earlier the same day, and gotten it wrong. Caddy's config file is bind-mounted into the container, and a `git checkout` on the host swaps in a new inode. The running Caddy process keeps looking at the old one, so a graceful `caddy reload` never sees the update. My first patch tried `caddy reload` with a restart fallback. It didn't work: reload never found the new config, so it fell through to `docker compose restart caddy` on every single deploy, whether the Caddyfile had changed or not. The fix for that fix was to just force-recreate Caddy unconditionally, which solved the stale-config problem but did nothing for the app1/app2 double-recreate, which I hadn't isolated yet as a separate bug.

## Rolling one replica at a time

The actual fix replaces the two-line deploy with a loop:

```sh
for svc in app1 app2; do
  docker compose up -d --no-deps --force-recreate --wait --wait-timeout 90 "$svc"
  sleep 10
done
```

`--wait` blocks until the new container reports healthy, so a broken image fails the deploy instead of taking the site down: the bad replica never comes up, `--wait` times out at 90 seconds, the job fails, and the other replica is still serving the old, working image. That only works because I added a healthcheck to `docker-compose.yml` for the first time: `curl -fsS -o /dev/null http://localhost:80/`, checked every 10 seconds with a 15-second start period. Without it, `--wait` has nothing to wait on.

The `sleep 10` between replicas exists because Caddy's own active health check runs on a 5-second interval. If I tear down `app2` the instant `app1` comes back healthy, Caddy hasn't necessarily re-probed and re-admitted `app1` yet, so there's still a window where both replicas look down to the proxy. Ten seconds gives Caddy at least one full probe cycle of margin before I touch the second replica.

## Making Caddy retry instead of 502

Even with the rolling recreate, a request can still land on a replica in the half-second between the container going away and Caddy's health check noticing. For that I added to the Caddyfile:

```
reverse_proxy app1:80 app2:80 {
	lb_policy round_robin
	lb_try_duration 5s
	lb_try_interval 250ms
	health_uri /
	health_interval 5s
	health_timeout 3s
}
```

`lb_try_duration` and `lb_try_interval` only kick in when the upstream never responds at all (connection refused, not a real HTTP error), so it's safe to let it retry the other replica automatically, POSTs included: there's no double-submit risk because nothing was ever received on the failed attempt.

## Three smaller bugs the same pass caught

Getting the rolling logic right surfaced three more edge cases that would've quietly broken it:

- **Line endings.** The deploy script now diffs the running Caddyfile against the repo copy byte-for-byte to decide whether Caddy needs recreating at all. A CRLF checked out on the box versus LF in git would make that compare always report a difference, forcing a Caddy recreate on every deploy regardless of real changes. I pinned `docker/Caddyfile text eol=lf` in `.gitattributes` and stripped `\r` on both sides of the compare as a second layer of insurance.
- **Two stacks fighting over one name.** `docker-compose.yml` had no explicit project name, so a deploy run by the CI runner and a manual `docker compose` run by hand from a different checkout directory would have managed two separate stacks and two separate sets of named volumes. I pinned `name: intranet` at the top of the compose file so both paths always resolve to the same stack.
- **Migrations across a live roll.** For the length of the rollout, one replica is running the new image against a database another replica is reading with the old image, because they share one SQLite file. I left a comment in the deploy script spelling out the rule this forces: migrations may only add (`CREATE TABLE`/`INDEX IF NOT EXISTS`, a nullable or defaulted `ADD COLUMN`), never drop, rename, or narrow anything in the same release, or the old replica breaks mid-roll.

I also caught a stale comment in `docker/entrypoint.sh` that still described the stack as running in host networking mode, left over from an earlier design. It's bridge networking now, with Caddy reaching each replica by Docker's own service-name DNS. The comment now says so, and says explicitly not to switch back, since host mode would collide both replicas on the same port and break the DNS lookup the load balancer depends on.

The whole change is 76 lines added across five files, no new services, no new dependencies. The rolling loop plus the healthcheck it depends on is what actually closes the downtime window; everything else in that commit is a bug that would have undermined it quietly, on some later deploy, for reasons nobody would have connected back to a compose file.
