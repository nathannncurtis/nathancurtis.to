---
title: "Bulk-Updating a Legacy Database Without Breaking the Vendor's App"
date: "March 2026"
readTime: "5 min"
tags: ["C#", "SQL Server", "Production"]
---

## The situation

You have a production SQL Server database. It's owned by a vendor application that's been running for years. You need to bulk-update thousands of records across multiple related tables. The vendor doesn't expose an API for this. The only supported way to make changes is through the vendor's GUI, one record at a time.

Doing 10,000 records one-at-a-time through a GUI is not an option. So you write a tool that talks to the database directly. The catch: you don't own the schema, you don't have documentation for it, and if you break something, the vendor's application stops working and you get to explain why.

## Reverse-engineering the schema

Step one is understanding what you're touching. SQL Server makes this easier than most databases because you can query the system catalog:

```sql
-- Find all tables that reference a specific column name
SELECT t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON c.TABLE_NAME = t.TABLE_NAME
WHERE c.COLUMN_NAME LIKE '%Attorney%'
ORDER BY t.TABLE_NAME
```

The vendor's naming conventions (once you spot them) tell you a lot. Tables prefixed with the same word are usually related. Columns named "ID" with matching names across tables are foreign keys, even when the schema doesn't declare them as such. Columns named "Additional1" through "Additional10" are the extensibility mechanism the vendor built when they realized customers would need custom fields.

Those "Additional" columns are exactly what the tool updates. The vendor intended them to be user-configurable through their GUI. The tool just does it at scale.

## The safety model

The tool uses a three-layer safety approach:

**1. Preview before commit.** Every bulk operation runs a SELECT first to show exactly which records will be affected and what the old values are. The user reviews the preview before any UPDATE runs. No blind writes.

**2. Transaction wrapping.** Every batch of updates runs inside a transaction. If any single update fails, the entire batch rolls back. You don't end up with 5,000 records updated and 5,000 in the old state.

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

**3. Parameterized queries only.** Every value goes through SqlCommand parameters. Never string interpolation, never concatenation. This isn't just about SQL injection (though that matters). It's about data types. A parameter with a DateTime value will always be handled correctly by the driver. A string-interpolated date might work on your machine and break on a server with different locale settings.

## What I learned

**Test against a restored backup, not production.** This sounds obvious but the temptation to "just try one record" in production is real. Restore a backup to a test instance. Run the tool against that. Verify the results in the vendor's GUI. Then run against production.

**Log every mutation.** Every UPDATE the tool runs gets logged with the table, the record ID, the column, the old value, and the new value. If something goes wrong six months later, you can trace exactly what changed and when.

**Respect the vendor's constraints.** Just because a column allows 500 characters doesn't mean the vendor's GUI can display 500 characters. Just because a column is nullable doesn't mean the vendor's application handles nulls. Stay within the bounds of what the GUI would allow, even when the database technically allows more.

**The vendor will upgrade the schema.** It happened twice. Both times, columns moved and table names changed. The tool broke. The fix was to make the column mappings configurable instead of hardcoded. Now a schema change is a config file update, not a code change.
