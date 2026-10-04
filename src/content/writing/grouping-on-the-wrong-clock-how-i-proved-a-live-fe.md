---
title: "Grouping on the Wrong Clock: How I 'Proved' a Live Feed Was Dead"
date: "October 2026"
readTime: "8 min"
tags: ["SQL Server", "Data Analysis", "Debugging"]
---

In August I was auditing what the office's order database could already do, ahead of a client portal redesign. One open question was whether clients had ever been able to get order status in a machine-readable form, or whether that would have to be built from nothing. At 8:31 one evening I committed a finding that the office had run exactly that kind of feed to dozens of law firms and switched it off for all but one of them in September 2022. At 10:06 the same evening I committed the retraction. The feed had last run at 17:30 that day, three hours before the first commit.

## The table nobody could attribute

The second-largest table in the database is `StatusJSONIndex`, at 15,261,623 rows. Nothing in the decompiled vendor application writes to it. Its columns:

```
StatusLineitem, FacilityLineitem, Workorder, CustomerCode,
BillToCustomerCode, StatusDate, DateTimeReported
```

It's clustered unique on `(Workorder, FacilityLineitem, StatusLineitem)`, which is the key of the status table, and in the sample rows `DateTimeReported` landed a day or so after `StatusDate`. So I read it as an outbound ledger: one row per status, stamped when that status was pushed to somebody as JSON. That reading was right, and it's the only part of the finding that survived.

## The probe

The next question was who received the feed. `CustomerCode` isn't indexed, so I bounded on the clustered key to make it a range seek over "recent" work orders and grouped by customer:

```sql
SELECT TOP 25 RTRIM(CustomerCode) AS CustomerCode, COUNT(*) AS N,
       MIN(StatusDate) AS First, MAX(StatusDate) AS Last
FROM StatusJSONIndex WITH (NOLOCK)
WHERE Workorder >= '660000'
GROUP BY RTRIM(CustomerCode) ORDER BY COUNT(*) DESC
```

The top of the output, with the customer codes swapped for letters:

```
A     13,431   2003-06-20 -> 2022-09-22
B     12,256   2004-04-21 -> 2026-08-19
C     10,350   2004-02-20 -> 2022-06-17
D      9,128   2009-02-05 -> 2026-08-19
E      7,764   2004-06-18 -> 2022-09-23
F      7,730   2003-07-11 -> 2022-09-21
```

I joined the twenty-five codes to the customer table and got the office's client book. Three of them had a last date of that day, and all three were branches of one firm. The other twenty-two ended earlier, fourteen of them in September 2022.

A count by year showed what looked like the same cliff:

```
StatusJSONIndex rows per year (by StatusDate):
   2020       731,334
   2021       697,840
   2022       543,268
   2023       123,046
   2024       107,471
```

I wrote it up as a capability the office used to have, ran for dozens of firms, and turned off for everyone but one client. I even added a list under the line "Two honest limits on the claim." One was that the push was slow, averaging 43.6 hours from status to export. The other was that the data couldn't say why it stopped, and that somebody at the office would remember.

Nobody would have remembered, because it never stopped.

## Three things wrong with one query

The first is the date column. `StatusDate` is when the status happened on the order. `DateTimeReported` is when the row was exported. `MAX(StatusDate)` per customer tells you when that customer's orders last had activity. A firm whose last order with us wrapped up in 2022 has a last status in 2022 whether or not a row was ever exported to anyone. Only the export stamp can say whether an export stopped. It was in the table, and I grouped on the other column.

The second is the customer column. There are two. `CustomerCode` is the firm that placed the order. `BillToCustomerCode` is who pays for it, and on these orders the payer is the party receiving the feed. I read the ordering firm as the recipient. The first probe had printed three sample rows, all from one work order, and each carried the same bill-to code. It was on my screen and I didn't look at it.

The third is the `WHERE` clause. `Workorder` is a `char(12)`, and not every work order is numeric. Opposing-side orders carry an `OPP` prefix, and letters sort above digits. `Workorder >= '660000'` with no upper bound swept in the whole `OPP` series, 138,246 orders. The output said so. A window of recent work orders doesn't contain statuses from 2003-06-20, and that date is in the `First` column of the first row.

I didn't find any of this by rereading my own query. I had several agents documenting the database in parallel that night, and one of them had written up the decompiled source of a small desktop export tool that turned out to be the table's writer. Its selection query answers the first two in its `WHERE` clause:

```sql
WHERE s.StatusDate BETWEEN @theFromDate AND @theToDate
   AND s.DateTimeReported IS NULL
   AND w.BillToCustomerCode = @theBillToCode
```

One bill-to code, and a null export stamp meaning "not sent yet." That account said the consumer was a single insurer. Mine said dozens of law firms. They couldn't both be right.

## The re-run

Same table, two-sided bounds on the numeric series, grouped on the bill-to column and the export stamp:

```sql
SELECT TOP 20 RTRIM(BillToCustomerCode) AS BillTo, COUNT(*) AS N,
       COUNT(DISTINCT RTRIM(CustomerCode)) AS DistinctCustomers,
       MAX(DateTimeReported) AS LastExport
FROM StatusJSONIndex WITH (NOLOCK)
WHERE Workorder >= '600000' AND Workorder < '700000'
GROUP BY RTRIM(BillToCustomerCode) ORDER BY COUNT(*) DESC
```

`TOP 20` was optimistic. One row came back:

```
<insurer>    312,171    19 customers  last 2026-08-19 17:30:45.377000
```

312,171 rows in the window and one recipient, fed by nineteen ordering firms. None of the twenty-two firms from my "switched off" list are among the nineteen. Grouped by month on `DateTimeReported`, the last two years show exports on 15 to 23 distinct days in every complete month:

```
   2026-05     12,274 rows on  21 distinct days
   2026-06     11,355 rows on  20 distinct days
   2026-07     11,050 rows on  23 distinct days
   2026-08      7,161 rows on  13 distinct days
```

Grouped by ordering firm, the first and last export stamps are mostly at 17:30. It's an evening export that ran the whole time, most recently three hours before I wrote that it had been switched off. The three branches I'd called "still fed" were the three largest ordering firms on that insurer's work.

## The full rebuild resets the export stamp

The same write-up of the export tool turned up a hazard. The tool has two maintenance dialogs that rebuild the table. The full rebuild does this:

```sql
DELETE StatusJSONIndex
INSERT StatusJSONIndex
SELECT s.LineItem, s.FacilityLineitem, s.WorkOrder, w.CustomerCode,
       w.BillToCustomerCode, s.Date, null
FROM <status table> as s
...
WHERE s.Comment = 0
```

The last selected column is a literal `null`, and it lands in `DateTimeReported`. The export picks up rows `WHERE DateTimeReported IS NULL`. So a full rebuild marks every row as never sent, and the next export re-sends everything the insurer already has in whatever date range is chosen. The partial rebuild only inserts rows that are missing, so it's the safe one. I flagged it in the audit for whoever owns that job.

## What September 2022 probably was

The cliff in the yearly counts is real, and I think the cause is dull. The statistics on the table's clustered index were last updated on 2022-09-26, when the table held 14,821,072 rows, and they show 440,551 modifications since. Those two numbers add up to 15,261,623, the current row count. The latest of the September 2022 dates in my wrong list was also 2022-09-26.

My guess is that someone ran the full rebuild that day, which loads every status for every customer, and that only the insurer's rows have been added since. That would explain why the old rows cover the whole client book and the new ones cover one payer. I haven't confirmed it with anyone.
## The retraction

The corrected section went in 95 minutes after the wrong one. I kept the original text in the file, collapsed in a `<details>` block under the correction with a summary that starts "Superseded," so anyone who read the first version can see what it said and what changed. The correction says of the original claim, "That was wrong on every count."

The corrected finding was also more useful for the portal. The office already runs a production, machine-readable status feed. It goes to one insurer and every other client gets nothing, which is the gap a portal fills.

The superseded section still lists its two honest limits. The column I grouped on isn't one of them.
