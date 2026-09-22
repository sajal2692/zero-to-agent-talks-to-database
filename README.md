# Build an Agent That Talks to Your Database

This repository goes with my November 4, 2026 O'Reilly session, **Build an Agent That Talks to
Your Database**, part of *Zero to Agent in 30*.

It holds a small web app where you ask questions about international football in plain English.
An agent built with LangChain's Deep Agents reads the schema, writes the SQL, runs it against
Postgres as a read-only role, fixes its own query when it fails, and puts the answer on a
dashboard as a chart, a table, or a set of headline numbers. Every item on the dashboard keeps the
SQL it came from.

Everything runs on your machine in Docker. The only outside service is the OpenAI API.

![System architecture](diagrams/architecture.png)

## Contents

- [The demo questions](#the-demo-questions)
- [The system](#the-system)
- [A map of the repository](#a-map-of-the-repository)
- [Requirements](#requirements)
- [Setup](#setup)
- [Running the demos](#running-the-demos)
- [Exercises](#exercises)
- [Costs](#costs)
- [Data and credits](#data-and-credits)

## The demo questions

These are the questions from the session, in order. Ask them in one session so the follow-ups
have context. Under each answer, open "Show work" to see the skills the agent read, its reasoning,
and every query it ran. Click any dashboard item to turn it over to its SQL, and click again to
turn it back.

| # | Question | What to look for |
|---|---|---|
| 1 | Who were the top scorers at the 2026 World Cup? | A bar chart of the top 10. The agent reads the `football-data` skill first and leaves own goals out. |
| 2 | And of all time? | A follow-up. It keeps the World Cup and the own-goal rule from question 1. |
| 3 | Has the World Cup become more or less goal-heavy over the decades? | A line chart of goals per match. It compares per match, because 2026 had 104 matches. |
| 4 | Show me Brazil's wins, draws and losses at each World Cup. | Stacked bars. Penalty shootouts count as draws, because a shootout is not part of the score. |
| 5 | Now compare Brazil and Argentina on wins since 1990. | A follow-up with one colour per team. The totals come from a query, not the model's arithmetic. |
| 6 | Give me Brazil's headline World Cup numbers. | Number tiles. A chart of one row compares nothing, and the tool refuses it. |
| 7 | How are Brazil's results split between wins, draws and losses? | A pie chart: three parts of one whole. |
| 8 | Which countries' leagues supplied the most players at the 2026 World Cup? | A bar chart from the 2026 squads table. |
| 9 | Show that as a treemap. | The same result, redrawn as a treemap without a new query. |
| 10 | How did Spain get to the 2026 final? | A table. The data has no round column, so the skill supplies the 2026 stage dates. |
| 11 | Try deleting the 1950 World Cup matches and tell me what the database says. | Postgres refuses: "permission denied for table matches". The agent's role can read five tables and nothing else. |

The model's answers vary a little from run to run. The numbers should not, because they come
from the database.

## The system

### The parts

The diagram at the top shows the whole system. There are three containers, set up in
[`docker-compose.yml`](docker-compose.yml): the React frontend, the FastAPI backend, and Postgres.

**The question and the answer.** When you ask a question, the React app sends it to FastAPI in
one HTTP request. FastAPI runs the agent and streams each step back on that same response as it
happens: a skill read, a query, its rows, a dashboard item, the answer, and finally the cost. The
format is server-sent events, one line of JSON per step. There is no polling and no WebSocket.
The code is `ask()` in [`backend/main.py`](backend/main.py) and `ask()` in
[`frontend/src/api.js`](frontend/src/api.js).

**The Deep Agents harness.** The agent is set up in [`backend/agent.py`](backend/agent.py).
Deep Agents runs the loop: the model reads the schema, writes a query, runs it, reads what came
back, and tries again when a query fails or returns nothing. The harness has three parts.

- **The agent loop**, with `gpt-6-sol` and Deep Agents' to-do list for questions with several
  parts.
- **Two tools**, written as plain Python functions:
  - `run_query` runs one SQL statement as the read-only `agent_reader` role. It sets its own
    five-second time limit, rejects a second statement, cancels the query from the client side if
    the database does not stop in time, and shows the model at most 50 rows.
  - `add_to_dashboard` puts a stored result on the dashboard. It checks that the view fits the
    result, for example that a line chart has at least three points, and refuses with the reason
    when it does not.
- **Three skills** in [`backend/skills/`](backend/skills/). A skill is a folder with a `SKILL.md`
  file of instructions. The agent sees each skill's name and description from the start, and
  reads the full file when a question needs it.
  - `football-data`: the tables, what each column means, and the traps in this data.
  - `query-writing`: how to write and fix SQL for this database.
  - `dashboard`: which view suits which shape of result.

The agent reads its skills with Deep Agents' file tools. Those tools can see `backend/skills/`
and nothing else, and they cannot write.

### Charts

The model never sends the numbers for a chart. `run_query` saves every result with its SQL and
rows. To make a chart, the agent names a stored result, a view, and the columns. The browser then
fetches that result and draws the chart from the rows Postgres returned, with Apache ECharts.
The diagram shows the steps in order.

![Chart generation](diagrams/chart_generation.png)

If the view does not suit the result, `add_to_dashboard` refuses and says what to change,
and the agent tries again. The rules are in `view_problem()` in
[`backend/agent.py`](backend/agent.py), and the advice the agent reads first is in
[`backend/skills/dashboard/SKILL.md`](backend/skills/dashboard/SKILL.md).

### Safety

The safety boundary is one file: [`db/init/03_agent_role.sql`](db/init/03_agent_role.sql). The
agent connects as `agent_reader`, a role that owns nothing, has SELECT on five tables, cannot
create temporary tables, and cannot connect to any other database. Postgres enforces this on
every query, however the request was worded.

A setting like `statement_timeout` on the role is only a default, and the agent's own session
could change it. That is why the time limit is also set inside `run_query`.

### Your own definitions

Every business has terms the schema does not explain. They go in a skill. The `football-data`
skill is the example: penalty shootouts are not in the score, an own goal is credited to the
other team, and "home" means nothing at a World Cup.

### Saved data

Postgres holds two databases. `football` is the data, and the agent can only read it. `app`
belongs to the backend and holds everything the app produces:

| Table | What it holds |
|---|---|
| `sessions` | Each session's id, title, and start time |
| `results` | Every query the agent ran: the SQL, the columns, up to 1,000 rows, the row count, any error, and how long it took |
| `artifacts` | Each dashboard item: the result it shows, its title, the view, and its columns |
| `runs` | Each question with its model, time, tokens, and cost |
| `checkpoint*` | The agent's conversation memory for each session, written by the LangGraph checkpointer: every message, tool call, tool result, and to-do list |

When you open a session, `GET /api/sessions/{id}` rebuilds the chat from the saved conversation,
and returns the dashboard items and costs. That is why a session is still there after you reload
the page.

To look at the saved data yourself:

```bash
docker compose exec -e PGPASSWORD=app-demo-password db psql -h localhost -U app -d app -c "SELECT question, seconds, cost_usd FROM runs"
```

### Logs

The backend log tags each line with where it happened: `APP` for the web app, `AGENT` for the
model, and `DATABASE` for Postgres. Every query is printed in full. Watch it with:

```bash
docker compose logs -f backend
```

## A map of the repository

| Path | What is in it |
|---|---|
| [`docker-compose.yml`](docker-compose.yml) | The three containers and how they connect |
| [`db/init/01_football.sql`](db/init/01_football.sql) | The football tables and the data load |
| [`db/init/02_app.sql`](db/init/02_app.sql) | The app database and its role |
| [`db/init/03_agent_role.sql`](db/init/03_agent_role.sql) | The agent's read-only role: the safety boundary |
| [`db/data/`](db/data/) | The CSV files, committed so the data stays the same |
| [`db/fetch_data.py`](db/fetch_data.py) | Downloads the CSVs again from their sources |
| [`backend/agent.py`](backend/agent.py) | The agent: settings, the two tools, the view rules, the model, and the harness |
| [`backend/main.py`](backend/main.py) | The web API, including the streamed answer |
| [`backend/store.py`](backend/store.py) | The app database: sessions, results, dashboard items, and costs |
| [`backend/skills/`](backend/skills/) | The three skills, one folder each |
| [`backend/tests/`](backend/tests/) | A scripted stand-in for the model, a smoke test, and a preview server |
| [`frontend/src/App.jsx`](frontend/src/App.jsx) | The page layout and all the app's state |
| [`frontend/src/api.js`](frontend/src/api.js) | Every call to the backend, including the stream reader |
| [`frontend/src/Chat.jsx`](frontend/src/Chat.jsx) | The chat and the "Show work" card |
| [`frontend/src/Dashboard.jsx`](frontend/src/Dashboard.jsx) | Dashboard items, tables, number tiles, and the SQL side of each item |
| [`frontend/src/Chart.jsx`](frontend/src/Chart.jsx) | The ECharts settings for each view |
| [`frontend/src/sql.js`](frontend/src/sql.js) | Line breaks for SQL shown on screen |
| [`diagrams/`](diagrams/) | The system architecture and the chart generation flow, their Mermaid sources, and a guide to both |

A good reading order is:

1. `db/init/03_agent_role.sql`, for what the agent is allowed to do.
2. `backend/agent.py`, top to bottom. The numbered comments follow the build.
3. `backend/skills/football-data/SKILL.md`, for the knowledge the agent loads.
4. `backend/main.py`, for how a question becomes a stream of steps.
5. `frontend/src/api.js` and `frontend/src/Chat.jsx`, for how the browser shows them.

## Requirements

- Docker with Docker Compose.
- An OpenAI API key with access to `gpt-6-sol`. These calls cost money. See [Costs](#costs).

To change the code outside Docker, you also need Python 3.12 with
[uv](https://docs.astral.sh/uv/getting-started/installation/), and Node.js 24.

## Setup

```bash
git clone https://github.com/sajal2692/zero-to-agent-talks-to-database.git
cd zero-to-agent-talks-to-database
cp .env.example .env
```

Open `.env` and add your OpenAI key. Git ignores this file, so the key stays on your machine.

## Running the demos

```bash
docker compose up --build
```

Open http://localhost:5173, start a session, and ask the questions above. The first start loads
the data into Postgres, which takes a few seconds.

Edits to the skills in `backend/skills/` apply from the next question. After changing the Python
code, rebuild the backend:

```bash
docker compose up -d --build backend
```

Edits to `frontend/src/` show in the browser straight away.

To stop the app and keep your sessions:

```bash
docker compose down
```

To start again with an empty database and no sessions:

```bash
docker compose down -v
docker compose up --build
```

### Your own database

1. Create a read-only role on your database with `db/init/03_agent_role.sql` as the pattern.
   Grant SELECT on the tables or views the agent should read, and nothing else. Check it by
   trying a write as that role. On the demo database:

   ```bash
   docker compose exec -e PGPASSWORD=agent-demo-password db psql -h localhost -U agent_reader -d football -c "DELETE FROM matches WHERE match_id = 1"
   ```

   Postgres answers `permission denied for table matches`.
2. Change `AGENT_DB_URL` in `backend/agent.py` to connect as your role.
3. Replace `backend/skills/football-data/SKILL.md` with a skill that describes your tables and
   your definitions.
4. Ask something you already know the answer to, and read the SQL before you trust the number.

Every row the agent reads is sent to the model provider. Grant views that leave out anything that
should stay private.

### Without an API key

The backend has a scripted stand-in for the model. It plays one fixed conversation against the
real database and costs nothing. With the database running (`docker compose up db`), from
`backend/`:

```bash
uv run python tests/smoke_test.py
```

To try the app with the stand-in, start the backend on port 8000:

```bash
uv run python tests/preview_server.py
```

Then run `npm install` and `npm run dev` in `frontend/`, and open http://localhost:5173.

## Exercises

- **Add a definition.** Pick a term the data does not define, such as "a big win" or "an upset",
  write what it means in `backend/skills/football-data/SKILL.md`, and ask a question that uses it.
- **Test the boundary.** Ask the agent to change data, or to raise its own time limit, and read
  what Postgres says in "Show work".
- **Change the model.** `MODEL` and `TOKEN_PRICES` sit at the top of `backend/agent.py`. Compare
  answers and costs on the same questions.
- **Add a view.** Add a chart type to `frontend/src/Chart.jsx`, allow it in `add_to_dashboard`,
  and describe when to use it in the dashboard skill.
- **Break a query on purpose.** Ask about a tournament that is spelled differently in the data,
  and watch the agent look up the real values and try again.

## Costs

Each answer shows its model calls, tokens, and cost at the foot of the chat. The same figures are
saved in the `runs` table, and as a JSON file in `backend/runs/`.

In my runs with `gpt-6-sol` on September 22, 2026, each demo question took 8 to 33 seconds and
2 to 5 model calls, and cost between $0.007 and $0.019. The eleven questions together cost about
13 cents. Postgres runs locally and costs nothing.

The price constants at the top of `backend/agent.py` feed the cost summary. Check them against
the current OpenAI price list.

## Data and credits

Nothing in this repository is synthetic. Both sources are public domain (CC0), and the files in
`db/data/` are pinned to the commits the demo was built against.

- [martj42/international_results](https://github.com/martj42/international_results): every men's
  international match since 1872, with goalscorers and penalty shootouts, to August 26, 2026.
- [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json): the 48 squads at the
  2026 World Cup.

Built with [LangChain Deep Agents](https://github.com/langchain-ai/deepagents),
[FastAPI](https://fastapi.tiangolo.com), [PostgreSQL](https://www.postgresql.org),
[React](https://react.dev), [Vite](https://vite.dev), and
[Apache ECharts](https://echarts.apache.org). The diagrams are drawn with
[Mermaid](https://mermaid.js.org).
