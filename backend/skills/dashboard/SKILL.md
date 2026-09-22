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
- One number or a few headline numbers, such as a count and an average, go on the dashboard as
  `stat`, not as a one-row table.
- When the user asks for a follow-up ("now just Argentina"), add a new item. Do not replace the
  earlier one.

## Which view

| The result shows | Use |
|---|---|
| A ranking or a comparison across categories | `bar` |
| Parts that add up to a total for each category, such as wins, draws, and losses per team | `stacked_bar` |
| A value over time, such as by year or by tournament | `line` |
| Several series over time, such as two teams' goals by decade (one column per series) | `line` |
| Totals over time where the size of each part matters | `area` |
| Shares of one whole, with five or fewer parts | `pie` |
| Shares of one whole with many parts, such as players per club | `treemap` |
| Two measures for the same items | `scatter` |
| One number or a few headline numbers | `stat` |
| Detail the user will read row by row, such as a list of matches | `table` |

Choose a chart when the result has numbers to compare, even with 20 or more rows. Use `table`
only for lists people read row by row, such as matches with their scores. Vary the view to fit
the result. A dashboard of the same chart repeated is harder to read.
To compare series on one chart, return one column per series, for example with
`count(*) FILTER (WHERE ...)`.

## Columns

- `x` is the category or time column. `y` is one or more numeric columns.
- For `scatter`, `y` is two numeric columns, across then up, and `x` names each point.
- Order the rows in SQL the way they should appear: rankings largest first, time oldest first.
- Keep bar charts to about 15 bars. Limit the query if needed.
- Write a title that says what the chart shows, for example
  "Goals per match at each World Cup, 1930 to 2026".
