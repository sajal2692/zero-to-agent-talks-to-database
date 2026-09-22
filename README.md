# Build an Agent That Talks to Your Database

This repository goes with my November 4, 2026 O'Reilly session, **Build an Agent That Talks to
Your Database**, part of *Zero to Agent in 30*.

It holds a small web app where you ask questions about international football in plain English.
An agent looks at the tables, writes the SQL, runs it, and puts the answer on a dashboard as a
chart, a table, or a few headline numbers. Click any item on the dashboard to see the SQL behind
it.

The agent is built with LangChain's Deep Agents. Everything runs on your machine in Docker, and
the only outside service is the OpenAI API.

![System architecture](diagrams/architecture.png)

## Contents

- [The system](#the-system)
- [A map of the repository](#a-map-of-the-repository)
- [Requirements](#requirements)
- [Setup](#setup)
- [Running the app](#running-the-app)
- [Exercises](#exercises)
- [Costs](#costs)
- [Data and credits](#data-and-credits)

## The system

The app runs in three Docker containers: a React frontend, a FastAPI backend with the agent, and
Postgres. When you ask a question, the agent looks at the tables, writes a query, runs it, and
tries again when a query fails. Each step shows up in the chat under "Show work".

- [`docs/components.md`](docs/components.md) describes each part and what it does.
- [`diagrams/README.md`](diagrams/README.md) walks through the architecture diagram and the
  [chart generation flow](diagrams/chart_generation.png).

### Safety

The agent connects to Postgres as `agent_reader`. This role can read five tables and nothing
else, so Postgres refuses any attempt to change data, however the request is worded. The role is
set up in [`db/init/03_agent_role.sql`](db/init/03_agent_role.sql).

## A map of the repository

| Path | What is in it |
|---|---|
| [`docker-compose.yml`](docker-compose.yml) | The three containers |
| [`backend/agent.py`](backend/agent.py) | The agent: its model, tools, and settings |
| [`backend/skills/`](backend/skills/) | The three skills |
| [`backend/main.py`](backend/main.py) | The web API |
| [`backend/store.py`](backend/store.py) | Saved sessions, results, dashboard items, and costs |
| [`frontend/src/`](frontend/src/) | The React app: chat, dashboard, and charts |
| [`db/init/`](db/init/) | The football tables, the app database, and the agent's read-only role |
| [`db/data/`](db/data/) | The football data as CSV files |
| [`docs/`](docs/) | A description of each component |
| [`diagrams/`](diagrams/) | The architecture and chart generation diagrams, with a guide to both |

A good reading order is:

1. `docs/components.md`, for the parts and how they connect.
2. `backend/agent.py`, top to bottom. The numbered comments follow the build.
3. `backend/skills/football-data/SKILL.md`, for what the agent knows about the data.
4. `db/init/03_agent_role.sql`, for what the agent is allowed to do.

## Requirements

- Docker with Docker Compose.
- An OpenAI API key with access to `gpt-6-sol`. These calls cost money. See [Costs](#costs).

## Setup

```bash
git clone https://github.com/sajal2692/zero-to-agent-talks-to-database.git
cd zero-to-agent-talks-to-database
cp .env.example .env
```

Open `.env` and add your OpenAI key. Git ignores this file, so the key stays on your machine.

## Running the app

```bash
docker compose up --build
```

Open http://localhost:5173, start a session, and ask a question or pick one of the suggestions.
Ask follow-ups in the same session so the agent has the context. The first start loads the data
into Postgres, which takes a few seconds.

To see every query the agent runs, watch the backend log:

```bash
docker compose logs -f backend
```

Edits to the skills apply from the next question. After changing the Python code, rebuild the
backend:

```bash
docker compose up -d --build backend
```

To stop the app and keep your sessions:

```bash
docker compose down
```

To start again with no sessions, add `-v` to that command.

### Your own database

1. Create a read-only role on your database, with `db/init/03_agent_role.sql` as the pattern.
   Grant it the tables the agent should read, and nothing else.
2. Change `AGENT_DB_URL` in `backend/agent.py` to connect as that role.
3. Replace the `football-data` skill with one that describes your tables and your terms.
4. Ask something you already know the answer to, and read the SQL before you trust the number.

Every row the agent reads is sent to the model provider, so leave out anything that should stay
private.

## Exercises

- **Add a definition.** Pick a term the data does not define, such as "a big win" or "an upset",
  write what it means in the `football-data` skill, and ask a question that uses it.
- **Test the boundary.** Ask the agent to delete some matches, and read what Postgres says in
  "Show work".
- **Change the model.** `MODEL` sits at the top of `backend/agent.py`. Compare answers and costs
  on the same questions.
- **Add a chart type.** Add it to `frontend/src/Chart.jsx`, allow it in `add_to_dashboard`, and
  describe when to use it in the `dashboard` skill.
- **Break a query on purpose.** Ask about a tournament that is spelled differently in the data,
  and watch the agent look up the real names and try again.

## Costs

Each answer shows its cost at the foot of the chat. In my runs with `gpt-6-sol` on September 22,
2026, a question took 8 to 33 seconds and cost between $0.007 and $0.019. The prices are set at
the top of `backend/agent.py`. Check them against the current OpenAI price list.

## Data and credits

The data is real and public domain (CC0). The files in `db/data/` are pinned to the versions the
app was built with.

- [martj42/international_results](https://github.com/martj42/international_results): every men's
  international match since 1872, with goalscorers and penalty shootouts, to August 26, 2026.
- [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json): the 48 squads at the
  2026 World Cup.

Built with [LangChain Deep Agents](https://github.com/langchain-ai/deepagents),
[FastAPI](https://fastapi.tiangolo.com), [PostgreSQL](https://www.postgresql.org),
[React](https://react.dev), [Vite](https://vite.dev), and
[Apache ECharts](https://echarts.apache.org). The diagrams are drawn with
[Mermaid](https://mermaid.js.org).
