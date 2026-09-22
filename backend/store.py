"""The app database: sessions, query results, and dashboard artifacts.

Plain SQL through one connection pool. The agent's conversation memory lives in the same
database, in tables the LangGraph checkpointer creates for itself.
"""

import uuid

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id          text PRIMARY KEY,
    title       text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS results (
    id          serial PRIMARY KEY,
    session_id  text NOT NULL REFERENCES sessions ON DELETE CASCADE,
    sql         text NOT NULL,
    columns     jsonb,
    rows        jsonb,
    row_count   integer,
    truncated   boolean NOT NULL DEFAULT false,
    error       text,
    ms          integer,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS artifacts (
    id          serial PRIMARY KEY,
    session_id  text NOT NULL REFERENCES sessions ON DELETE CASCADE,
    result_id   integer NOT NULL REFERENCES results,
    title       text NOT NULL,
    view        text NOT NULL,
    x           text,
    y           jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
"""


def open_pool(url):
    """autocommit and dict rows are what the LangGraph Postgres checkpointer expects too."""
    pool = ConnectionPool(url, kwargs={"autocommit": True, "row_factory": dict_row}, open=True)
    with pool.connection() as conn:
        conn.execute(SCHEMA)
    return pool


def create_session(pool, title="New session"):
    session_id = uuid.uuid4().hex[:12]
    with pool.connection() as conn:
        return conn.execute(
            "INSERT INTO sessions (id, title) VALUES (%s, %s) RETURNING *", (session_id, title)
        ).fetchone()


def list_sessions(pool):
    with pool.connection() as conn:
        return conn.execute("SELECT * FROM sessions ORDER BY created_at DESC").fetchall()


def get_session(pool, session_id):
    with pool.connection() as conn:
        return conn.execute("SELECT * FROM sessions WHERE id = %s", (session_id,)).fetchone()


def rename_session(pool, session_id, title):
    with pool.connection() as conn:
        conn.execute("UPDATE sessions SET title = %s WHERE id = %s", (title, session_id))


def delete_session(pool, session_id):
    with pool.connection() as conn:
        conn.execute("DELETE FROM sessions WHERE id = %s", (session_id,))


def save_result(pool, session_id, sql, columns, rows, truncated, error, ms):
    with pool.connection() as conn:
        return conn.execute(
            """INSERT INTO results (session_id, sql, columns, rows, row_count, truncated, error, ms)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (session_id, sql, Jsonb(columns), Jsonb(rows), len(rows or []), truncated, error, ms),
        ).fetchone()["id"]


def get_result(pool, result_id):
    with pool.connection() as conn:
        return conn.execute("SELECT * FROM results WHERE id = %s", (result_id,)).fetchone()


def save_artifact(pool, session_id, result_id, title, view, x, y):
    with pool.connection() as conn:
        return conn.execute(
            """INSERT INTO artifacts (session_id, result_id, title, view, x, y)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
            (session_id, result_id, title, view, x, Jsonb(y)),
        ).fetchone()["id"]


def get_artifact(pool, artifact_id):
    """One artifact with the SQL and rows it came from."""
    with pool.connection() as conn:
        return conn.execute(
            """SELECT a.*, r.sql, r.columns, r.rows, r.row_count, r.truncated
               FROM artifacts a JOIN results r ON r.id = a.result_id WHERE a.id = %s""",
            (artifact_id,),
        ).fetchone()


def list_artifacts(pool, session_id):
    """Each artifact with the SQL and rows it came from, oldest first."""
    with pool.connection() as conn:
        return conn.execute(
            """SELECT a.*, r.sql, r.columns, r.rows, r.row_count, r.truncated
               FROM artifacts a JOIN results r ON r.id = a.result_id
               WHERE a.session_id = %s ORDER BY a.id""",
            (session_id,),
        ).fetchall()
