# Build an Agent That Talks to Your Database

This repo goes with my November 4, 2026 O'Reilly session, **Build an Agent That Talks to Your
Database**, part of *Zero to Agent in 30*.

It is a small web app where you ask questions about international football in plain English. An
agent built with LangChain's Deep Agents writes the SQL, runs it against Postgres as a read-only
role, fixes its own query when it fails, and puts the answer on a dashboard as a chart or a table.
Click any item on the dashboard to see the SQL behind it.

## The demo questions

These are the questions from the session, in order. Ask them in one session so the follow-ups
have context. Open "Show work" under each answer to see every query the agent ran, and click any
dashboard item to turn it over to its SQL.

| # | Question | What to look for |
|---|---|---|
| 1 | Who were the top scorers at the 2026 World Cup? | A bar chart of the top 10. The agent reads the `football-data` skill first and leaves own goals out. |
| 2 | And of all time? | A follow-up. It keeps the World Cup and the own-goal rule from question 1. |
| 3 | Has the World Cup become more or less goal-heavy over the decades? | A line chart of goals per match. It compares per match, because 2026 had 104 matches. |
| 4 | Show me Brazil's wins, draws and losses at each World Cup. | Stacked bars. Penalty shootouts count as draws, because a shootout is not in the score. |
| 5 | Now compare Brazil and Argentina on wins since 1990. | A follow-up with one colour per team. The totals come from a query, not the model's arithmetic. |
| 6 | Give me Brazil's headline World Cup numbers. | Number tiles. A chart of one row compares nothing, and the tool refuses it. |
| 7 | How are Brazil's results split between wins, draws and losses? | A pie chart of three parts of one whole. |
| 8 | Which countries' leagues supplied the most players at the 2026 World Cup? | A bar chart from the 2026 squads table. |
| 9 | Show that as a treemap. | The same result, redrawn as a treemap without a new query. |
| 10 | How did Spain get to the 2026 final? | A table. The data has no round column, so the skill supplies the 2026 stage dates. |
| 11 | Try deleting the 1950 World Cup matches and tell me what the database says. | Postgres refuses: "permission denied for table matches". The agent's role can read five tables and nothing else. |

## How it works

![How the football data agent fits together](docs/architecture.png)

The diagram's source is [`docs/architecture.mmd`](docs/architecture.mmd).

```text
frontend/   React app: sessions, chat, and the dashboard
backend/    FastAPI and the agent
db/         Postgres setup: tables, the data, and the agent's role
docs/       the architecture diagram
```

**The agent** is in [`backend/agent.py`](backend/agent.py). Deep Agents runs the loop: the model
reads the schema, writes a query, runs it, reads what came back, and tries again when a query
fails or returns nothing. The agent has three parts.

- **Two tools**, written as plain Python functions in `agent.py`:
  - `run_query` runs one SQL statement as the read-only `agent_reader` role. It sets its own time
    limit, rejects a second statement, cancels from the client side if the database does not
    stop in time, and shows the model at most 50 rows.
  - `add_to_dashboard` puts a stored result on the dashboard as a chart or a table. The chart is
    drawn from the rows the database returned, so its numbers never come from the model.
- **Planning.** Deep Agents' to-do list, switched on with `TodoListMiddleware`, for questions with
  several parts.
- **Three skills** in [`backend/skills/`](backend/skills/). A skill is a folder with a `SKILL.md`
  file. The agent sees each skill's name and description at the start, and reads the full file
  when a question needs it.
  - `football-data`: the tables, what each column means, and the traps in this data.
  - `query-writing`: how to write and fix SQL for this database.
  - `dashboard`: which chart suits which result.

The agent reads its skills through Deep Agents' file tools. Those tools can see `backend/skills/`
and nothing else, and they cannot write.

**Safety** is in [`db/init/03_agent_role.sql`](db/init/03_agent_role.sql). Read that file first
if you point this at your own data. The agent connects as a role that owns nothing, has SELECT on
five tables, cannot create temporary tables, and cannot connect to any other database. A setting
like `statement_timeout` on the role is only a default that the agent's own session could change,
so the time limit is also set in the query tool.

**Your definitions** go in a skill. Every business has terms the schema does not explain. The
`football-data` skill is the example: penalty shootouts are not in the score, own goals are
credited to the other team, and "home" means nothing at a World Cup.

**What the app saves.** Postgres holds two databases. `football` is the data, and the agent
can only read it. `app` belongs to the backend and holds everything the app produces:

| Table | What it holds |
|---|---|
| `sessions` | Each session's id, title, and start time |
| `results` | Every query the agent ran: the SQL, the columns, up to 1,000 rows, the row count, any error, and how long it took |
| `artifacts` | Each dashboard item: the result it shows, its title, the chart type, and its columns |
| `runs` | Each question with its model, time, tokens, and cost |
| `checkpoint*` | The agent's conversation memory for each session, written by the LangGraph checkpointer: every message, tool call, tool result, and to-do list |

The frontend gets its data two ways. While a question runs, `POST /api/sessions/{id}/ask`
streams each step as a server-sent event, and each new dashboard item is fetched with its SQL
and rows from `GET /api/artifacts/{id}`. When you open a session, `GET /api/sessions/{id}`
returns the chat rebuilt from the saved conversation, the dashboard items, and the costs.

To look at the saved data yourself:

```bash
docker compose exec -e PGPASSWORD=app-demo-password db psql -h localhost -U app -d app -c "SELECT question, seconds, cost_usd FROM runs"
```

**Logs.** The backend prints each step with where it happened: `APP` for the web app, `AGENT`
for the model, and `DATABASE` for Postgres, with every query in full.

## Requirements

- Docker with Docker Compose
- An OpenAI API key with access to `gpt-6-sol`. These calls cost money. See [Costs](#costs).

To change the code outside Docker you also need Python 3.12 with
[uv](https://docs.astral.sh/uv/getting-started/installation/), and Node.js 24.

## Setup

```bash
git clone https://github.com/sajal2692/zero-to-agent-talks-to-database.git
cd zero-to-agent-talks-to-database
cp .env.example .env
```

Open `.env` and add your OpenAI key. Git ignores this file.

## Run the demos

```bash
docker compose up --build
```

Open http://localhost:5173, start a session, and ask the questions above. The first start loads
the data into Postgres, which takes a few seconds.

Edits to the skills in `backend/skills/` apply from the next question. After changing the
Python code, rebuild the backend:

```bash
docker compose up -d --build backend
```

To start again with an empty database and no sessions:

```bash
docker compose down -v
docker compose up --build
```

### Your own database

1. Create a read-only role on your database using `db/init/03_agent_role.sql` as the pattern.
   Grant SELECT on the tables or views the agent should read, and nothing else. Check it by
   trying a write as that role. On the demo database:

   ```bash
   docker compose exec -e PGPASSWORD=agent-demo-password db psql -h localhost -U agent_reader -d football -c "DELETE FROM matches WHERE match_id = 1"
   ```

   Postgres answers `permission denied for table matches`.
2. Change `AGENT_DB_URL` in `backend/agent.py` to connect as that role.
3. Replace `backend/skills/football-data/SKILL.md` with a skill that describes your tables and
   your definitions.
4. Ask something you already know the answer to, and read the SQL before you trust the number.

Every row the agent reads is sent to the model provider. Grant views that leave out anything that
should stay private.

### Without an API key

The backend has a scripted stand-in for the model that plays one fixed conversation against the
real database. It costs nothing. With the database running (`docker compose up db`), from
`backend/`:

```bash
uv run python tests/smoke_test.py
uv run python tests/preview_server.py
```

The second command serves the backend on port 8000. Run the frontend with `npm install` and
`npm run dev` in `frontend/`, then open http://localhost:5173.

## Costs

Each answer shows its model calls, tokens, and cost at the foot of the chat. The backend saves
the same figures in the `runs` table and as a JSON file in `backend/runs/`. The price constants at the top of
`backend/agent.py` feed that summary. Check them against the current price list.

On my runs with `gpt-6-sol` on September 22, 2026, each demo question took 8 to 33 seconds and
2 to 5 model calls, and cost between $0.007 and $0.019. The eleven questions together cost 13
cents.

## Data and credits

Nothing in this repo is synthetic. Both sources are public domain (CC0), and the files in
`db/data/` are pinned to the commits the demo was rehearsed against. `db/fetch_data.py` downloads
them again.

- [martj42/international_results](https://github.com/martj42/international_results): every men's
  international match since 1872, with goalscorers and penalty shootouts, to August 26, 2026.
- [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json): the 48 squads at the
  2026 World Cup.

Built with [LangChain Deep Agents](https://github.com/langchain-ai/deepagents),
[FastAPI](https://fastapi.tiangolo.com), [PostgreSQL](https://www.postgresql.org),
[React](https://react.dev), [Vite](https://vite.dev), and
[Apache ECharts](https://echarts.apache.org).
