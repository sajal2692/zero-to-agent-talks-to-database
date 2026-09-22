"""The agent: two database tools, three skills, and Deep Agents running the loop.

main.py imports `agent`, `pool`, `log`, and `usage_and_cost` from this file.
"""

import os
import re
import sys
import threading
import time
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal

import psycopg
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware.filesystem import FilesystemPermission
from deepagents.profiles import GeneralPurposeSubagentProfile, HarnessProfile, register_harness_profile
from dotenv import load_dotenv
from langchain.agents.middleware import ModelCallLimitMiddleware, TodoListMiddleware
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.postgres import PostgresSaver

import store

load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # for runs outside Docker

MODEL = "gpt-6-sol"
REASONING_EFFORT = "medium"
DB_HOST = os.environ.get("DB_HOST", "localhost")
AGENT_DB_URL = f"postgresql://agent_reader:{os.environ['AGENT_DB_PASSWORD']}@{DB_HOST}:5432/football"
APP_DB_URL = f"postgresql://app:{os.environ['APP_DB_PASSWORD']}@{DB_HOST}:5432/app"
SKILLS_DIR = Path(__file__).resolve().parent / "skills"

QUERY_TIMEOUT = "5s"          # set by the tool on every query
CLIENT_TIMEOUT_SECONDS = 8    # the tool cancels the query itself if the database has not stopped it
ROWS_TO_MODEL = 50            # rows the model sees, and so rows sent to the model provider
ROWS_TO_KEEP = 1000           # rows kept for the dashboard

# US dollars per million tokens (input, cached input, output). Check the current price list.
TOKEN_PRICES = (2.00, 0.20, 10.00)  # gpt-6-sol, checked 2026-09-22

SYSTEM_PROMPT = """You are a data analyst for international football. You answer questions by querying
a Postgres database with run_query, and you put the result that answers each question on the
dashboard with add_to_dashboard.

Read the football-data skill before your first query in a conversation, and the dashboard skill
before your first add_to_dashboard call. Answer in two or three sentences of plain text, without
markdown, and give the numbers that matter. Every number in your answer must appear in a query
result. Do not add numbers up yourself: when you need a total, compute it in SQL. If the data
cannot answer a question, say so."""


def log(where, heading, body=""):
    """Every line says where it happened: APP is the web app, AGENT is the model, DATABASE is Postgres."""
    heading = f"[{datetime.now():%H:%M:%S}] {where:<9}{heading}"
    if sys.stdout.isatty() and "NO_COLOR" not in os.environ:
        heading = f"\033[1;{ {'APP': 32, 'AGENT': 34, 'DATABASE': 35}[where] }m{heading}\033[0m"
    print(f"\n{heading}", flush=True)
    if body:
        print(body, flush=True)


CLAUSE = re.compile(r"(WITH|SELECT|FROM|(?:LEFT |RIGHT |INNER |FULL )?JOIN|WHERE|AND|GROUP BY|HAVING|ORDER BY|LIMIT|UNION)\b", re.I)


def readable(sql):
    """For the log: a query written on one line is broken before each main clause,
    outside brackets and quotes."""
    if "\n" in sql:
        return sql
    out, depth, quoted, i = [], 0, False, 0
    while i < len(sql):
        ch = sql[i]
        quoted = not quoted if ch == "'" else quoted
        depth += 0 if quoted else (ch == "(") - (ch == ")")
        clause = ch == " " and depth == 0 and not quoted and CLAUSE.match(sql, i + 1)
        if clause:
            out.append(("\n  " if clause.group(1).upper() == "AND" else "\n") + clause.group(1))
            i += 1 + len(clause.group(1))
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def plain(value):
    """Turn database values into things JSON can hold."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


# 1. The app database stores query results, dashboard items, and the agent's conversation memory.
pool = store.open_pool(APP_DB_URL)


# 2. Tool one: run a query as the read-only agent role, with the tool's own limits.
@tool(response_format="content_and_artifact")
def run_query(sql: str, runtime: ToolRuntime) -> tuple[str, dict]:
    """Run one SQL statement against the football database, as a read-only role.

    SELECT works. Postgres refuses anything that changes data, with a permission error.
    Returns a result_id, the column names, and up to 50 rows, or the database's error.
    Pass the result_id to add_to_dashboard to show the result beside the chat.
    """
    session_id = runtime.config["configurable"]["thread_id"]
    log("DATABASE", "Query", readable(sql))
    started = time.time()
    columns, rows, truncated, error = None, None, False, None

    with psycopg.connect(AGENT_DB_URL) as conn:
        timer = threading.Timer(CLIENT_TIMEOUT_SECONDS, conn.cancel_safe)
        timer.start()
        try:
            # The time limit lasts for this transaction only, whatever the session default says.
            # Writes need no check here: the role has SELECT only, so Postgres refuses them.
            conn.execute(f"SET LOCAL statement_timeout = '{QUERY_TIMEOUT}'")
            # prepare=True sends the SQL as a prepared statement, and Postgres rejects a second statement.
            cursor = conn.execute(sql, prepare=True)
            if cursor.description:
                columns = [column.name for column in cursor.description]
                fetched = cursor.fetchmany(ROWS_TO_KEEP + 1)
                truncated = len(fetched) > ROWS_TO_KEEP
                rows = [[plain(value) for value in row] for row in fetched[:ROWS_TO_KEEP]]
        except psycopg.Error as e:
            error = str(e).strip()
        finally:
            timer.cancel()
            conn.rollback()

    ms = round((time.time() - started) * 1000)
    result_id = store.save_result(pool, session_id, sql, columns, rows, truncated, error, ms)
    if error:
        log("DATABASE", f"Error after {ms} ms", error)
        return f"result_id: {result_id}\nerror: {error}", {"result_id": result_id, "error": error, "ms": ms}

    rows = rows or []
    shown = rows[:ROWS_TO_MODEL]
    table = "\n".join(" | ".join(str(value) for value in row) for row in shown)
    count = f"{len(rows)}{'+' if truncated else ''}"
    log("DATABASE", f"{count} rows in {ms} ms", " | ".join(columns or []) + "\n" + "\n".join(table.splitlines()[:8]))
    text = (f"result_id: {result_id}\nrows: {count}, showing {len(shown)}\n"
            f"columns: {' | '.join(columns or [])}\n{table}")
    return text, {"result_id": result_id, "row_count": len(rows), "truncated": truncated, "ms": ms}


def view_problem(view, x, y, rows, is_number):
    """The dashboard's rules for which view fits which result. Returns what to change, or None.
    The dashboard skill explains the same rules to the model."""
    if view == "table":
        return None
    if not y or not all(is_number(c) for c in y):
        return "Name one or more y columns that hold numbers, or use view='table'."
    if view == "stat":
        return "A stat shows one row. Use a chart or a table for several rows." if len(rows) > 1 else None
    if len(rows) == 1:
        return "One row is a headline number. Use view='stat', with the row's name as x, or view='table'."
    if not x:
        return "A chart needs an x column that names each bar, slice, or point."
    if view in ("line", "area") and len(rows) < 3:
        return "A line needs three or more points. Use view='bar' to compare two."
    if view == "pie" and len(rows) > 6:
        return "A pie reads well with six slices or fewer. Use 'bar' to rank, or 'treemap' for many parts."
    if view == "stacked_bar" and len(y) < 2:
        return "A stacked bar needs two or more y columns that add up to a total. Use view='bar' for one."
    if view == "scatter" and (len(y) != 2 or len(rows) < 5):
        return "A scatter needs exactly two y columns and five or more rows."
    return None


# 3. Tool two: put a result on the dashboard. The chart uses the stored rows, so its numbers
#    come from the database and never from the model.
@tool(response_format="content_and_artifact")
def add_to_dashboard(
    result_id: int,
    title: str,
    view: Literal["bar", "stacked_bar", "line", "area", "pie", "treemap", "scatter", "stat", "table"],
    runtime: ToolRuntime,
    x: str | None = None,
    y: list[str] | None = None,
) -> tuple[str, dict]:
    """Show a query result on the dashboard beside the chat, as a chart, headline numbers, or a table.

    result_id: the id run_query returned. x: the category or time column. y: one or more
    numeric columns. For view="table", leave x and y out. For view="stat", y names the numbers
    to show from a one-row result. The dashboard skill says which view suits which result, and
    this tool refuses a view that does not fit, with the reason.
    """
    session_id = runtime.config["configurable"]["thread_id"]
    result = store.get_result(pool, result_id)
    if not result or result["session_id"] != session_id or result["error"]:
        return f"No usable result with id {result_id}. Run the query first.", {}
    columns, rows = result["columns"], result["rows"] or []
    missing = [c for c in [x, *(y or [])] if c and c not in columns]
    if missing:
        return f"These columns are not in result {result_id}: {', '.join(missing)}", {}
    is_number = lambda c: all(row[columns.index(c)] is None or isinstance(row[columns.index(c)], (int, float))
                              for row in rows)
    problem = view_problem(view, x, y or [], rows, is_number)
    if problem:
        log("APP", f"Dashboard view refused: {view}", problem)
        return f"Not added. {problem}", {}

    artifact_id = store.save_artifact(pool, session_id, result_id, title, view, x, y or [])
    return f"Added to the dashboard as item {artifact_id}.", {"artifact_id": artifact_id}


# 4. The model. It calls tools with reasoning on only through OpenAI's Responses API.
#    Reasoning summaries let the log show what it decided.
model = ChatOpenAI(model=MODEL, use_responses_api=True, reasoning={"effort": REASONING_EFFORT, "summary": "auto"})

# 5. Deep Agents adds file tools, subagents, and a shell by default. This agent keeps only the
#    tools it needs to read its skills. Its only way to the database is run_query.
register_harness_profile(f"openai:{MODEL}", HarnessProfile(
    excluded_tools=frozenset({"write_file", "edit_file", "delete", "execute", "task"}),
    general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
))

# 6. The checkpointer keeps each session's conversation in the app database, keyed by session id.
checkpointer = PostgresSaver(pool)
checkpointer.setup()

agent = create_deep_agent(
    model=model,
    tools=[run_query, add_to_dashboard],
    system_prompt=SYSTEM_PROMPT,
    skills=["/"],                                          # every folder in skills/ is a skill
    backend=FilesystemBackend(root_dir=SKILLS_DIR, virtual_mode=True),  # the file tools see skills/ only
    permissions=[FilesystemPermission(operations=["write"], paths=["/**"], mode="deny")],  # and never write
    middleware=[
        TodoListMiddleware(),                              # planning is opt-in since deepagents 0.7
        ModelCallLimitMiddleware(run_limit=25),            # stop a question that runs away
    ],
    checkpointer=checkpointer,
)


def usage_and_cost(messages, seconds):
    """Tokens and dollars for one question, from the model messages it produced."""
    fresh = cached = written = requests = 0
    for message in messages:
        if isinstance(message, AIMessage) and message.usage_metadata:
            usage = message.usage_metadata
            read = usage.get("input_token_details", {}).get("cache_read", 0)
            requests += 1
            cached += read
            fresh += usage.get("input_tokens", 0) - read
            written += usage.get("output_tokens", 0)
    cost = (fresh * TOKEN_PRICES[0] + cached * TOKEN_PRICES[1] + written * TOKEN_PRICES[2]) / 1e6
    return {
        "model": MODEL, "seconds": round(seconds), "model_requests": requests,
        "input_tokens": fresh, "cached_input_tokens": cached, "output_tokens": written,
        "cost_usd": round(cost, 3),
    }
