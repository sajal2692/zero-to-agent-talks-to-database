-- The app database holds sessions, query results, dashboard artifacts, and the agent's
-- conversation memory. The backend creates its tables at startup. The agent's role cannot reach it.

\getenv app_password APP_DB_PASSWORD
CREATE ROLE app LOGIN PASSWORD :'app_password';
CREATE DATABASE app OWNER app;
