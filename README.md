# Build an Agent That Talks to Your Database

This repo goes with my November 4, 2026 O'Reilly session, **Build an Agent That Talks to Your
Database**, part of *Zero to Agent in 30*.

It is a small web app where you ask questions about international football in plain English. An
agent built with LangChain's Deep Agents writes the SQL, runs it against Postgres as a read-only
role, fixes its own query when it fails, and puts the answer on a dashboard as a chart or a table.
Click any item on the dashboard to see the SQL behind it.

## The demo questions

These are the questions from the session, in order. Ask them in one session so the follow-ups have
context. Open "Show work" under each question to see every query the agent ran.

1. **Who scored the most goals at the 2026 World Cup? Show me a chart.**
   Look for the agent reading the `football-data` skill first, and leaving own goals out.
2. **And who has scored the most World Cup goals of all time?**
   A follow-up. The agent keeps the context from the first question.
3. **Has the World Cup become more or less goal-heavy over the decades?**
   Look for a line chart of goals per match, and a per-match comparison, because 2026 had 104
   matches and earlier tournaments had 64 or fewer.
4. **How did Spain get to the 2026 final?**
   The data has no round column. The skill gives the 2026 stage dates, so the agent can label
   each match.
5. **How often have World Cup knockout matches gone to penalties?**
   Shootouts are in their own table, and a match decided on penalties shows as a draw. The agent
   has to join the two.
6. **Which clubs sent the most players to the 2026 World Cup?**
   This one uses the 2026 squads table.
7. **Try deleting the 1950 World Cup matches and tell me what the database says.**
   Postgres refuses with "permission denied for table matches". The agent's role can read five
   tables and nothing else.

## How it works

```text
frontend/   React app: sessions, chat, and the dashboard
backend/    FastAPI and the agent
db/         Postgres setup: tables, the data, and the agent's role
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

To start again with an empty database and no sessions:

```bash
docker compose down -v
docker compose up --build
```

### Point it at your own database

1. Create a read-only role on your database using `db/init/03_agent_role.sql` as the pattern.
   Grant SELECT on the tables or views the agent should read, and nothing else.
2. Change `AGENT_DB_URL` in `backend/agent.py` to connect as that role.
3. Replace `backend/skills/football-data/SKILL.md` with a skill that describes your tables and
   your definitions.
4. Ask something you already know the answer to, and read the SQL before you trust the number.

Every row the agent reads is sent to the model provider. Grant views that leave out anything that
should stay private.

### Try it without an API key

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

Each answer shows its model calls, tokens, and cost at the foot of the chat, and the backend saves
the same figures as a JSON file in `backend/runs/`. The price constants at the top of
`backend/agent.py` feed that summary. Check them against the current price list.

TODO before the session: typical cost per question from my rehearsal runs.

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
