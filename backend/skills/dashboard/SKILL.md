---
name: dashboard
description: When and how to add a result to the dashboard as a chart or a table, and which chart type suits which result.
---

# Adding results to the dashboard

The dashboard is the panel beside the chat. Each item on it comes from a query you ran, so its
numbers are the database's numbers. Add a result with `add_to_dashboard`, passing the
`result_id` that `run_query` returned.

## What to add

- Add the result that answers the question. Leave out exploration queries such as schema checks
  and value lookups.
- Add one item per question unless the user asks for more.
- When the user asks for a follow-up ("now just Argentina"), add a new item. Do not replace the
  earlier one.

## Which view

| The result shows | Use |
|---|---|
| A ranking or a comparison across categories | `bar` |
| A value over time, such as by year or by tournament | `line` |
| A total over time where the size matters | `area` |
| Shares of one whole, with five or fewer parts | `pie` |
| Two measures for the same items | `scatter` |
| Detail the user will read row by row, such as a list of matches | `table` |

## Columns

- `x` is the category or time column. `y` is one or more numeric columns.
- For `scatter`, `y` is two numeric columns, across then up, and `x` names each point.
- Order the rows in SQL the way they should appear: rankings largest first, time oldest first.
- Keep bar charts to about 15 bars. Limit the query if needed.
- Write a title that says what the chart shows, for example
  "Goals per match at each World Cup, 1930 to 2026".
