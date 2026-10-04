---
title: "My Read-Only Queries Took the Company Down"
date: "October 2026"
readTime: "8 min"
tags: ["SQL Server", "Python", "Production"]
---

In March I got a read-only login to the SQL Server behind the vendor app the whole office works in. I wanted to build a dashboard off it, and the first step was learning the schema, so I pointed an AI coding agent at the database with one small question: for one stop on a test order (a stop is one facility on an order), how do I query a status note I'd entered through the GUI, and who entered it. I told it the credentials were read-only and to keep researching until it was done. Then I typed "use multiple agents please."

About eight minutes later the vendor's GUI threw an error. I pasted all 78 lines of it into the chat and asked whether it had anything to do with what the agent was doing. A minute after that I sent this:

> ok well you are taking down the company rn. make sure youre not doing anything. i can see 4 bashes are still running

It was a Monday afternoon, in an office where 50 to 90 people enter notes all day.

## What read-only protects

Read-only credentials protect the data. They do nothing for the server's capacity. I can't `UPDATE` a row with that login, but I can ask for every row of a 13 GB table from four shells at once, and the server will try.

I don't have the query text from that session any more, so I can't show the statements that ran. What I can show is why almost any exploratory query against the status-note table is a bad one. Five months later, in August, I measured it, almost entirely from catalog views that read no user pages:

- The status-note table is 45,118,498 rows and 13,407 MB.
- It has exactly one index, the clustered primary key `(WorkOrder, FacilityLineItem, LineItem)`.
- The instance is SQL Server 2017 Standard at compatibility level 100, with read-committed snapshot off.
- There is no read replica, and on Standard Edition there can't be a readable one.

The question I'd asked was who entered a note. The entered-by column isn't in that key, and neither is the date, the action, the employee or the note text. Any predicate that doesn't lead with `WorkOrder` reads all 13 GB. I can't prove which query did the damage that afternoon.

The rules that came out of it are still in the research repo, under a heading that says to read them first:

- One query at a time. Never in parallel, and never through parallel agents.
- `WITH (NOLOCK)` on every read.
- A 10 second timeout, one connection, open, query, close.
- `WHERE` leads with `WorkOrder`.

## The dashboard's sync would have scanned it every 30 seconds

The same day I asked the obvious follow-up: if a few simple queries did that, the dashboard would do it all day. It was still a demo running against a local database, and wiring it to production meant hundreds of queries, a set for every employee on the board.

The plan I landed on in that chat was a local copy. Pull each table once overnight, then every 30 seconds ask only for what's new. I committed it on March 17, and the incremental half looked like this:

```python
cursor.execute(
    f"SELECT {col_list} FROM {table_name} WITH (NOLOCK) WHERE {pk} > ?",
    (last_key,),
)
```

For the status-note table, `pk` was `LineItem`. `LineItem` is the primary key of my local SQLite copy, and the sync used it as if it were the key on the server too. On the server it's the third column of the clustered key, so `WHERE LineItem > ?` can't seek, and "rows since the watermark" would be a scan of all 45 million rows every 30 seconds. The 10 second timeout and the `NOLOCK` hint were both in there. Neither changes how much the server has to read.

I'd asked close to the right question at the time: would the watermark query stay light even if 200,000 new things landed at once? I ended that part of the chat with "if youre saying 90 notes is light ... then we should be ok." Ninety rows coming back is light. I never asked how many rows the server reads to find them.

## A timeout on a query that led with the key

On April 8 I was building a small desktop viewer for a single work order. Loading one order gave me this:

```
Error: Execution Timeout Expired. The timeout period elapsed prior to
completion of the operation or the server is not responding.
```

That query did lead with the work order number. It was one statement joining the order header to three facility tables, the customer table twice, the attorney table twice and the contact table, with a 10 second command timeout and the parameter bound like this:

```csharp
cmd.Parameters.AddWithValue("@wo", workOrder);
```

`AddWithValue` on a C# string sends `nvarchar`. The column is `char(12)`, space-padded. The vendor's own app opened the same order almost immediately, and I said so in the chat. The fix that went in that afternoon typed the parameter to match the column and padded it:

```csharp
static SqlParameter CharParam(string name, string value, int size = 12)
{
    var p = new SqlParameter(name, SqlDbType.Char, size);
    p.Value = value.PadRight(size);
    return p;
}
```

The commit message gives the reason as "Typed SQL parameters (char/int) to avoid nvarchar index scans." The same commit also split the big join into one query per table and put timing logs around each one, and the viewer still loads orders that way. Both changes went in together, so I can't say how much of the fix was the parameter type and how much was the join.

## Change detection without touching the big table

In September I built an automation runner, a service that watches every stop in the company and reacts when its action changes. That is the "what's new since last time" problem again, on the table where that question costs 13 GB.

The answer was a different table. The vendor keeps a small pointer table that records, for each stop with a live action, which status note set it. It's a little over 20,000 rows, and the runner reads all of it every 60 seconds:

```sql
SELECT WorkOrder, FacilityLineItem, MAX(StatusLineItem) AS cur_li
FROM ActionPointer WITH (NOLOCK)
GROUP BY WorkOrder, FacilityLineItem
```

Then it diffs the result against the last snapshot, which lives in a local SQLite file:

```python
def diff_snapshot(snapshot, adi_rows):
    events = []
    for wo, fli, sli in adi_rows:
        was = snapshot.get((wo, fli))
        if was is None or was != sli:
            events.append({"workorder": wo, "facility_lineitem": fli,
                           "status_lineitem": sli, "previous": was})
    return events
```

Every pointer that moved is a stop whose action just changed. Only then does the runner touch the big table, fetching the pointed-at notes with `WHERE WorkOrder IN (...)` in chunks of 200, which is a clustered seek. It opens one connection per tick and runs its statements in series. The design doc names the `LineItem > @watermark` scan and calls it forbidden.

The query with no `WHERE` is the safe one here, and the filtered one is the one I'm not allowed to write. That still reads backwards to me.

## What the pointer table can't see

A note saved without setting a next action doesn't move the pointer, so the runner never sees it. Rules can only trigger on action changes.

Events aren't replayed either. On September 3 I created a rule at 11:43:44 and asked why it hadn't fired on the bulk test I'd posted at 11:34. The runner had already consumed those pointer moves with no rule to match them against.

A cold start has to throw away history on purpose. With an empty snapshot every pointer looks new, so the first tick baselines and emits nothing:

```
2026-09-03 11:29:03,223 - INFO - runner.service - cold start: baselined 20392 pointers, no events
```

The server hasn't changed either. Fifteen minutes after that line:

```
2026-09-03 11:44:12,510 - INFO - runner.service - rules loaded: 3 live-or-dry, 0 disabled (1 owners)
2026-09-03 11:44:22,908 - ERROR - runner.service - automations tick failed: (20047, b'DB-Lib error message 20003, severity 6:\nTDS server connection timed out\n...
2026-09-03 11:45:32,815 - INFO - runner.service - tick complete
```

The tick hit its 10 second timeout and failed. A failed tick doesn't advance the snapshot, so the next one diffed across the gap and picked up 7 events.
