---
title: "Bulk-Updating a Legacy Database Without Breaking the Vendor's App"
date: "March 2026"
readTime: "6 min"
tags: ["C#", "SQL Server", "Production"]
---

## The situation

You have a production SQL Server database. It's owned by a vendor application that's been running for years. You need to bulk-update thousands of records across related tables, and the vendor doesn't expose an API for it. The only supported way to change a record is through their GUI, one at a time.

Ten thousand records through a GUI is not happening. So you write a tool that talks to the database directly. The catch is the part that keeps you up at night: you don't own the schema, you have no documentation for it, and if you corrupt something the vendor's application depends on, that application stops working and you are the one explaining why.

Everything below is about working inside that constraint.

## You don't get a schema

There's no ER diagram and no data dictionary. What you have is the live catalog, and on SQL Server that's enough to start pulling threads:

```sql
-- Find all tables that reference a specific column name
SELECT t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON c.TABLE_NAME = t.TABLE_NAME
WHERE c.COLUMN_NAME LIKE '%Attorney%'
ORDER BY t.TABLE_NAME
```

The naming conventions are the only documentation you get, so you read them like tea leaves. Tables sharing a prefix are usually the same subsystem. A column called `AttorneyID` in one table and `AttorneyID` in another is a foreign key, whether or not the schema bothers to declare the constraint (it usually won't). And then there are the columns named `Additional1` through `Additional10`.

Those ten columns told me more about the vendor than any doc could have. They're the escape hatch someone added the day they realized every customer would demand a custom field they'd never anticipated: generic, numbered, untyped, waiting to be assigned a meaning per install. They were also exactly what I needed to touch. The vendor built them to be user-configurable through the GUI, so the tool just configures them at scale. That's the whole trick. Find the part of the schema the vendor already intended people to edit, and edit only that. The moment you're writing to a column the GUI never exposes, you've stopped extending the vendor's tool and started fighting it.

## Write as if the GUI were watching

One principle governs the entire tool: never do anything the vendor's own GUI couldn't have done. Every safety measure below is a consequence of that one rule.

**Preview before commit.** Every bulk operation runs a SELECT first and shows exactly which records will change and what the old values are. The user reads the preview and approves it before a single UPDATE runs. No blind writes.

**Wrap every batch in a transaction.** If any update in the batch fails, the whole batch rolls back. You never end up with 5,000 records changed and 5,000 left behind in the old state.

```csharp
using var transaction = connection.BeginTransaction();
try
{
    foreach (var record in batch)
    {
        var cmd = new SqlCommand(updateQuery, connection, transaction);
        cmd.Parameters.AddWithValue("@value", record.NewValue);
        cmd.Parameters.AddWithValue("@id", record.Id);
        cmd.ExecuteNonQuery();
    }
    transaction.Commit();
}
catch
{
    transaction.Rollback();
    throw;
}
```

**Parameters, never string-building.** Every value goes through a `SqlCommand` parameter. This is partly about SQL injection, but the bigger reason is data types. A `DateTime` passed as a parameter is handled correctly by the driver every time. A date built into a string by hand works on your machine and then breaks on a server with a different locale, and you find out in production.

**Stay inside GUI-plausible values.** A column that allows 500 characters doesn't mean the GUI can render 500. A nullable column doesn't mean the application tolerates a null. The database's limits are always wider than the application's, and the application is the one that has to keep working. Ask what a user could have typed into that field by hand, and don't exceed it.

## Test against a restored backup, not production

This sounds obvious and the temptation to "just try one record" in production is still real. Restore a backup to a test instance. Run the tool against that. Open the vendor's GUI and confirm the records look right from the application's side, not just the database's. Then, and only then, point it at production. The test that matters isn't "did the UPDATE succeed," it's "does the vendor's app still behave as if a human made the change."

## The schema will move under you

This is the one I learned the hard way, and it's the reason the tool is built the way it is now.

The vendor upgrades their application, and when they do, the schema comes along for the ride. It happened to me twice. Columns I depended on moved. Tables got renamed. Both times, a tool that had run cleanly for months threw on the first batch, because it was pointed at a schema that no longer existed.

The first time, I fixed it the fast way: found the renamed objects, patched the queries, redeployed. The second time, I stopped treating it as a bug and started treating it as a certainty. The table and column names came out of the code and went into a config file. Now a vendor upgrade that reshuffles the schema is a config edit. No recompile, no redeploy, and anyone can make the change, not just me.

Log every mutation while you're at it. Each UPDATE records the table, the record ID, the column, the old value, and the new value. When someone asks six months later what changed a particular field, the answer is a query against the log, not a shrug.

## The goal

The vendor still doesn't know the tool exists, and that's the measure of success. The database changes by the thousands, and from inside their application nothing looks any different than if a very fast, very careful clerk had gone in and done it all by hand.
