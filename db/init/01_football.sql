-- The football database: every men's international match since 1872, plus the 2026 World Cup squads.
-- Postgres runs this file once, the first time the container starts. The tables belong to the
-- postgres superuser. The agent never connects as this user; see 03_agent_role.sql.

CREATE DATABASE football;
\connect football

-- 1. Tables

CREATE TABLE matches (
    match_id    serial PRIMARY KEY,
    date        date NOT NULL,
    home_team   text NOT NULL,
    away_team   text NOT NULL,
    home_score  integer NOT NULL,   -- includes extra time, excludes penalty shootouts
    away_score  integer NOT NULL,
    tournament  text NOT NULL,      -- 'FIFA World Cup', 'Friendly', 'UEFA Euro', ...
    city        text,
    country     text,
    neutral     boolean NOT NULL    -- true when neither team was playing at home
);

CREATE TABLE goals (
    goal_id    serial PRIMARY KEY,
    match_id   integer NOT NULL REFERENCES matches,
    team       text NOT NULL,       -- the team credited with the goal
    scorer     text NOT NULL,
    minute     integer,             -- null when the source does not record it
    own_goal   boolean NOT NULL,
    penalty    boolean NOT NULL
);

CREATE TABLE shootouts (
    match_id       integer NOT NULL REFERENCES matches,
    winner         text NOT NULL,
    first_shooter  text
);

CREATE TABLE former_names (
    current_name  text NOT NULL,
    former_name   text NOT NULL,
    start_date    date,
    end_date      date
);

CREATE TABLE squads_2026 (
    team           text NOT NULL,
    fifa_code      text NOT NULL,
    group_name     text NOT NULL,
    shirt_number   integer,
    position       text,           -- GK, DF, MF, FW
    player         text NOT NULL,
    date_of_birth  date,
    club           text,
    club_country   text
);

-- 2. Load the CSVs. The source files join goals and shootouts to matches by date and team names,
--    so they go through staging tables and get a match_id on the way in.

COPY matches (date, home_team, away_team, home_score, away_score, tournament, city, country, neutral)
    FROM '/data/results.csv' WITH (FORMAT csv, HEADER true);

CREATE TEMP TABLE raw_goals (date date, home_team text, away_team text, team text, scorer text,
                             minute text, own_goal boolean, penalty boolean);
COPY raw_goals FROM '/data/goalscorers.csv' WITH (FORMAT csv, HEADER true);

CREATE TEMP TABLE raw_shootouts (date date, home_team text, away_team text, winner text, first_shooter text);
COPY raw_shootouts FROM '/data/shootouts.csv' WITH (FORMAT csv, HEADER true, NULL 'NA');

-- One pair of 1974 friendlies shares a date and both team names. DISTINCT ON keeps one match per goal.
INSERT INTO goals (match_id, team, scorer, minute, own_goal, penalty)
SELECT DISTINCT ON (g.ctid) m.match_id, g.team, g.scorer, NULLIF(g.minute, 'NA')::integer, g.own_goal, g.penalty
FROM raw_goals g
JOIN matches m ON m.date = g.date AND m.home_team = g.home_team AND m.away_team = g.away_team
ORDER BY g.ctid, m.match_id;

INSERT INTO shootouts (match_id, winner, first_shooter)
SELECT DISTINCT ON (s.ctid) m.match_id, s.winner, s.first_shooter
FROM raw_shootouts s
JOIN matches m ON m.date = s.date AND m.home_team = s.home_team AND m.away_team = s.away_team
ORDER BY s.ctid, m.match_id;

COPY former_names FROM '/data/former_names.csv' WITH (FORMAT csv, HEADER true, NULL 'NA');
COPY squads_2026 FROM '/data/squads_2026.csv' WITH (FORMAT csv, HEADER true);

-- 3. Indexes for the joins the agent will write most often.
CREATE INDEX ON goals (match_id);
CREATE INDEX ON shootouts (match_id);
CREATE INDEX ON matches (tournament, date);

-- 4. Comments. The agent can read these with the describe queries in its skill.
COMMENT ON TABLE matches IS 'Every men''s international match since 1872. Scores include extra time.';
COMMENT ON TABLE goals IS 'One row per goal. team is the team credited; own_goal means the scorer played for the other side.';
COMMENT ON TABLE shootouts IS 'Penalty shootouts. The match row shows the score after extra time, usually a draw.';
COMMENT ON TABLE squads_2026 IS 'The 26-player squads of the 48 teams at the 2026 World Cup.';
