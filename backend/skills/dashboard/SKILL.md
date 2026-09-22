---
name: dashboard
description: When and how to add a result to the dashboard, and how to choose the view from the shape of the result. Read before the first add_to_dashboard call.
---

# Adding results to the dashboard

The dashboard is the panel beside the chat. Each item on it comes from a query you ran, so its
numbers are the database's numbers. Add a result with `add_to_dashboard`, passing the
`result_id` that `run_query` returned.

## What to add

- Add the result that answers the question. Leave out exploration queries such as schema checks
  and value lookups.
- Add one item per question unless the user asks for more.
- For a follow-up ("now just Argentina"), add a new item. Do not replace the earlier one.
- When the user asks for a chart of a "who is the most" or "top" question, return a ranking, for
  example the top 10, so the chart has something to compare. Name the leader in your answer.

## Choosing the view

Decide from the shape of the result: how many rows, whether `x` is a name or a point in time,
and how many numeric columns there are.

**One row**

| The row holds | Use |
|---|---|
| One to six numbers, such as a count, a total, and an average | `stat`. Put the row's name, if any, in `x`. |
| A record people read, such as the details of one match | `table` |

**A name in `x`, one number in `y`**

| Rows | The numbers are | Use |
|---|---|---|
| 2 to 30 | Values to compare or rank, such as goals per player | `bar`, largest first |
| 2 to 6 | Parts that add up to a meaningful whole, such as results by type | `pie` |
| 7 or more | Parts of a whole, such as players per club country | `treemap` |
| More than 30 | Values to rank | `bar` with the top 15 |

**A name in `x`, several numbers in `y`**

| The numbers are | Use |
|---|---|
| Parts of one total, such as wins, draws, and losses | `stacked_bar` |
| The same measure for different groups, such as goals by two teams | `bar` with both columns |
| Different measures, such as matches and goals per match | Two items, or `table` |
| Exactly two measures to relate, with five or more rows | `scatter`, `y` across then up |

**A time in `x`: years, decades, or dates, oldest first**

| The numbers are | Use |
|---|---|
| One measure over three or more points | `line` |
| Several series of the same measure, one column each | `line` |
| Parts of a total over time | `stacked_bar`, or `area` for many points |
| Fewer than three points | `bar` |

**Rows people read one by one, such as a list of matches with their scores:** `table`.

## Rules the tool checks

`add_to_dashboard` refuses a view that does not fit and says what to use instead:

- Charts need two or more rows. One row is a `stat` or a `table`.
- A `line` or `area` needs three or more points.
- A `pie` has six slices or fewer.
- A `stacked_bar` needs two or more `y` columns.
- A `scatter` needs exactly two `y` columns and five or more rows.
- Every `y` column must hold numbers.

## Columns and titles

- `x` names each bar, slice, or point. When each row has a name and a group, such as a player and
  a team, return one label column, for example `scorer || ' (' || team || ')' AS player`.
- Order the rows in SQL the way they should appear: rankings largest first, time oldest first.
- Give computed columns readable names, such as `goals_per_match`. They become labels.
- Put numbers with different units in different items. Goals and goals per match do not share an
  axis.
- Write a title that says what the item shows, for example
  "Goals per match at each World Cup, 1930 to 2026".
