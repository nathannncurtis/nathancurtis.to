---
title: "When The Fleet Opens The Same Installer At Once"
date: "April 2026"
readTime: "5 min"
tags: ["Windows", "SMB", "Fleet Deployment"]
---

I run a small internal tool that pushes update notifications to a fleet of office machines: an agent polls a server every 30 seconds, the server hands back a toast, the user clicks it, and the agent runs a silent install off a network share. It works fine for one machine. It falls over in an interesting way when you send to all of them at once.

## The failure

Send a notification to a batch of agents and they all pick it up on their next heartbeat, which is within 30 seconds of each other for most of the fleet. Every one of those agents then reaches for the same installer EXE on the same UNC path at close to the same moment. Windows doesn't like that: a process opening an executable for execution takes something close to an exclusive handle on it, and the machines that lose the race get `ERROR_SHARING_VIOLATION` back from the open call. The install just fails, silently, on whichever machines happened to be a few hundred milliseconds late.

It's not a bug you'd catch testing on one machine, or even five. It only shows up at fleet scale, and it shows up as a pile of failed installs with no obvious pattern, since the "loser" of the race is whoever's heartbeat happened to land last.

## The fix: spread the delivery, not the install

The server already has a `Notification` row per agent with a `sent_at` timestamp. I added a nullable `scheduled_for` column (Alembic revision `0003`) and backfilled it to `sent_at` on every existing row, so the new column doesn't make the heartbeat filter suddenly hide notifications that were already in flight.

In the send handler (`ui.py`'s `POST /send`), instead of iterating `agent_ids` in whatever order they arrived from the form, I resolve the actual `Agent` rows sorted by `(username, machine_name)`:

```python
recipient_agents = (
    db.scalars(
        select(Agent)
        .where(Agent.id.in_(agent_ids))
        .order_by(Agent.username, Agent.machine_name)
    ).all()
)

now = _utcnow()
for offset_index, agent in enumerate(recipient_agents):
    scheduled_for = now + timedelta(
        seconds=_STAGGER_INTERVAL_SEC * offset_index
    )
```

`_STAGGER_INTERVAL_SEC` is `600`, ten minutes. Machine zero in the sorted order gets `scheduled_for = now`, machine one gets `now + 10m`, and so on down the batch. Sorting by `(username, machine_name)` instead of the raw form order matters more than it looks: if an admin re-sends the same notification to the same set of people later, they get the same schedule, not a shuffled one, because the order comes from stable data instead of whatever the browser happened to submit.

On the agent side, the heartbeat handler in `agent.py` used to pull every notification with `sent_at <= now`. Now it filters on the new column instead:

```python
candidates = db.scalars(
    select(Notification)
    .where(
        Notification.agent_id == agent.id,
        Notification.clicked_at.is_(None),
        Notification.dismissed_at.is_(None),
        (Notification.scheduled_for.is_(None))
        | (Notification.scheduled_for <= now),
    )
    .order_by(Notification.sent_at)
).all()
```

The `is_(None)` half of that clause is just insurance for the legacy rows the backfill already covers, so an old queue entry can never fall through the cracks between the migration and the deploy.

One thing I was careful not to touch: repeat notifications. A notification with a `repeat_interval_sec` still fires on its own clock, starting from whenever that particular agent's first delivery actually happened. Staggering only affects the very first delivery in a batch, not the reminder cadence after that.

## Making the schedule visible, not just correct

A ten-minute-per-machine stagger on a big batch means the last few machines in an alphabetical tail don't get their notification until a while after the send button was clicked. An admin watching the send page needs to know that up front instead of wondering why machine `zz-workstation-04` hasn't updated yet. So `send.html` got a live preview under the recipient picker that recalculates on every selection change:

```js
if (n === 1) {
    preview.textContent = '1 machine selected — fires immediately.';
} else {
    const lastOffset = (n - 1) * STAGGER_MIN;
    preview.textContent = `${n} machines selected — staggered ${STAGGER_MIN} min per machine. First fires now, last fires in ~${lastOffset} min.`;
}
```

And `notifications.html` got a new "Scheduled" column sitting between "Sent" and "To", so the staggered queue is visible at a glance instead of being an invisible property of rows in a database.

## Belt and suspenders

The server-side stagger was the fix I shipped this session, but it's a scheduling mitigation, not a structural one: it makes the race far less likely, it doesn't make it impossible. Two agents can still land in the same window if a heartbeat is late or a machine reboots at the wrong moment. Later the same day I went back and had the agent copy the installer to its own local cache under `installer-cache` before executing it, so each machine runs its own private copy of the file instead of contending for the shared one at all. The commit message for that one calls the ten-minute stagger "the primary defense" and the local copy "belt-and-suspenders." That's about right. The schedule buys you a wide gap where the lock almost never gets hit; the local copy means it doesn't matter if it does.
