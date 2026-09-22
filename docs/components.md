# Components

The [architecture diagram](../diagrams/architecture.png) shows how these parts connect. The code for
each part is linked under its name.

## React app

[`frontend/src/`](../frontend/src/)

This is the page you use. It shows your sessions on the left, the chat in the middle, and the
dashboard on the right. It sends your question to FastAPI, shows each step of the agent's work as
it arrives, and draws the charts with Apache ECharts.

## FastAPI

[`backend/main.py`](../backend/main.py)

FastAPI is the backend's web API. It creates, lists, and deletes sessions, and passes each question
to the agent. It streams the agent's steps back to the browser as they happen, as server-sent events
on a single HTTP response.

## Deep Agents harness

[`backend/agent.py`](../backend/agent.py)

Deep Agents runs the agent loop and gives it tools, skills, and a to-do list. It is set up so the
agent can read its skills but cannot write files or run shell commands.

### Agent loop

The model, `gpt-6-sol`, picks the next step each time: read a skill, run a query, add a result to
the dashboard, or answer. It sees each tool's result and keeps going until it can answer, with a
limit of 25 model calls per question.

### Tools

- `run_query` runs one SQL statement on the football data as a read-only role, with a five-second
  limit. It saves the result and shows the model the first 50 rows.
- `add_to_dashboard` puts a saved result on the dashboard as a chart, a table, or number tiles. If
  the view does not suit the result, it refuses and says what to change.

### Skills

[`backend/skills/`](../backend/skills/)

Each skill is a folder with a `SKILL.md` file. The agent sees every skill's name and description
from the start, and reads the full file when a question needs it.

- `football-data`: the tables, what each column means, and the traps in this data. For example, a
  penalty shootout is not part of the score.
- `query-writing`: how to write SQL for this database, and how to fix a query after an error or an
  empty result.
- `dashboard`: which view suits which shape of result.

When you point the agent at your own data, your tables and your business's terms go in a skill like
`football-data`.

## Postgres

[`db/init/`](../db/init/)

One Postgres server holds two databases. The scripts in `db/init/` create them on the first start.

### Football data

The `football` database has five tables: matches, goals, penalty shootouts, former country names,
and the 2026 World Cup squads. The agent connects as `agent_reader`, a role with read access to
these five tables and nothing else. [`03_agent_role.sql`](../db/init/03_agent_role.sql) sets it up.

### App data

[`backend/store.py`](../backend/store.py)

The `app` database belongs to the backend. It saves the sessions, every query result, the dashboard
items, the costs, and the agent's conversation memory. This is why a session is still there after
you reload the page, and why a follow-up question has the context of the earlier ones.

## OpenAI

OpenAI is the only outside service. The agent loop sends each model request to the OpenAI API, and
the query results the agent reads are part of those requests.
