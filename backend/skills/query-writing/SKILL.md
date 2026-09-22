---
name: query-writing
description: How to write, check, and fix SQL for this Postgres database, including what to do after an error or an empty result.
---

# Writing queries

## Rules of the query tool

- One statement per call. The tool rejects anything with a second statement.
- Write SELECT queries. The database role has SELECT and nothing else, so Postgres refuses
  any change to the data with a permission error.
- Each query stops after a few seconds. Aggregate in SQL and avoid cross joins.
- You see at most 50 rows. The dashboard keeps up to 1,000.

## How to work

1. Read the football-data skill if you have not yet in this conversation.
2. Write one query that answers the question. Use the exact column names from the schema.
3. Aggregate in SQL: group, count, sum, and order in the query, and return only the rows the answer
   needs. Use LIMIT for rankings.
4. Give computed columns readable names, for example `goals_per_match`, because they become chart
   labels.
5. Round averages with `round(x::numeric, 2)`.

## When a query fails

- A column or table error names the thing that is wrong. Check the schema and fix that name.
- A syntax error: rewrite the query more simply.
- A timeout: filter earlier, aggregate first, or join fewer rows.

## When a query returns nothing

An empty result usually means a filter value is spelled differently in the data. Look at the
actual values first, for example:

    SELECT DISTINCT tournament FROM matches WHERE tournament ILIKE '%world cup%'

Then run the query again with the exact value.

## Before you answer

Every number you give must be in a query result. If the answer needs a total or an average of
rows you already have, run one more query that computes it. Do not add rows up in your head.

Check that the numbers make sense. A team cannot have more wins than matches, and a World Cup
has at most 104 matches. If something looks wrong, look again before you answer.
