-- The agent's database role. This file is the safety boundary for the whole demo.
--
-- The agent connects as agent_reader. Whatever SQL the model writes, Postgres checks it against
-- these grants. A role with SELECT and nothing else cannot change a row, and no session setting
-- can undo that.

\getenv agent_password AGENT_DB_PASSWORD

-- 1. The role. It can log in, owns nothing, and gets at most five connections.
CREATE ROLE agent_reader LOGIN PASSWORD :'agent_password' CONNECTION LIMIT 5;

-- 2. Take away what every role gets by default: CONNECT and TEMPORARY on every database.
--    Without this, the agent could connect to the app database or create temporary tables.
REVOKE ALL ON DATABASE football FROM PUBLIC;
REVOKE ALL ON DATABASE app FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
REVOKE ALL ON DATABASE template1 FROM PUBLIC;

-- 3. Give back only what it needs: connect to football and read five tables.
GRANT CONNECT ON DATABASE football TO agent_reader;
\connect football
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO agent_reader;
GRANT SELECT ON matches, goals, shootouts, former_names, squads_2026 TO agent_reader;

-- 4. A session default. It is only a default: the agent's own session could change it with SET.
--    So the query tool in backend/agent.py sets its own time limit and row cap on every query.
--    default_transaction_read_only is the same kind of setting, so this file relies on the
--    grants above for writes.
ALTER ROLE agent_reader SET statement_timeout = '10s';

-- 5. A limit the role cannot change. Only a superuser can raise it.
ALTER ROLE agent_reader SET temp_file_limit = '100MB';
