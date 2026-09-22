---
name: football-data
description: The tables in the football database, what each column means, and the traps in this data. Read this before writing the first query in a conversation.
---

# The football database

Every men's international football match from 1872 to August 2026, with goalscorers and penalty
shootouts, plus the 26-player squads of the 48 teams at the 2026 World Cup. Public domain data
from martj42/international_results and openfootball/worldcup.json.

## Tables

**matches**: one row per match, about 49,500 rows.
- `match_id`, `date`, `home_team`, `away_team`, `home_score`, `away_score`
- `tournament`: 'FIFA World Cup', 'FIFA World Cup qualification', 'Friendly', 'UEFA Euro',
  'Copa América', and about 200 others
- `city`, `country`: where it was played
- `neutral`: true when neither team was playing at home

**goals**: one row per goal, about 47,900 rows. Join with `goals.match_id = matches.match_id`.
- `team`: the team credited with the goal
- `scorer`, `minute` (null when unknown), `own_goal`, `penalty`

**shootouts**: one row per penalty shootout, about 680 rows. Join on `match_id`.
- `winner`, `first_shooter`

**former_names**: earlier names of national teams, with the dates each name was used.
- `current_name`, `former_name`, `start_date`, `end_date`

**squads_2026**: one row per player at the 2026 World Cup, 1,248 rows.
- `team`, `fifa_code`, `group_name` (A to L), `shirt_number`, `position` (GK, DF, MF, FW)
- `player`, `date_of_birth`, `club`, `club_country`
- `squads_2026.team` uses the same team names as `matches`. `squads_2026.player` matches
  `goals.scorer` for 177 of the 178 players who scored at the 2026 World Cup.

## Definitions and traps

1. **Scores include extra time.** Penalty shootouts are not in the score. A knockout match that
   went to penalties shows as a draw in `matches`, and the team that went through is
   `shootouts.winner`. The 2022 World Cup final is 3-3 in `matches`.
2. **Own goals.** `goals.team` is the team that benefited. When `own_goal` is true, the scorer
   played for the other team. Leave own goals out of top-scorer lists.
3. **"Home" at a World Cup.** Almost every World Cup match is at a neutral venue, and home_team is
   only the order the teams are listed in. For home advantage, use matches where `neutral` is false.
4. **Tournament names.** 'FIFA World Cup' is the finals only. Qualifiers are
   'FIFA World Cup qualification'. Filter on the exact value.
5. **Team names.** The data uses current names. West Germany's matches are recorded as 'Germany'.
   Other renamed teams are in `former_names`.
6. **No stage column.** Rounds are not stored. The last World Cup match of each year is the final,
   except 1950, which ended with a final group. For 2026, the stages by date are:
   group stage 11 to 27 June, round of 32 28 June to 3 July, round of 16 4 to 7 July,
   quarter-finals 9 to 11 July, semi-finals 14 and 15 July, third place 18 July, final 19 July.
7. **2026 was the first 48-team World Cup,** with 104 matches. Earlier tournaments had 32 teams
   or fewer. Compare tournaments per match, not in totals.

## Checking the live schema

The tables above are the ones the agent can read. To confirm a column name or type:

    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'goals' ORDER BY ordinal_position

To see how values are stored before filtering on them:

    SELECT tournament, count(*) FROM matches GROUP BY 1 ORDER BY 2 DESC LIMIT 20
