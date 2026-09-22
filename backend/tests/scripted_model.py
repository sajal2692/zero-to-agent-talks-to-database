"""A stand-in for the OpenAI model that plays one fixed conversation. Used by the tests so they
cost nothing. Import it before main.py so agent.py picks it up."""

import re

import langchain_openai
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

TOP_SCORERS = """SELECT g.scorer, count(*) AS goals
FROM goals g
JOIN matches m ON m.match_id = g.match_id
WHERE m.tournament = 'FIFA World Cup'
  AND m.date >= '2026-01-01'
  AND NOT g.own_goal
GROUP BY g.scorer
ORDER BY goals DESC, g.scorer
LIMIT 10"""

GOALS_PER_MATCH = """SELECT extract(year FROM date)::int AS year,
       round(avg(home_score + away_score), 2) AS goals_per_match
FROM matches
WHERE tournament = 'FIFA World Cup'
GROUP BY year
ORDER BY year"""


class ScriptedModel(BaseChatModel):
    """Read a skill, query, try two unsafe queries, add a bar chart, query again, add a line chart."""

    model_name: str = "scripted"

    def __init__(self, **kwargs):
        super().__init__()

    @property
    def _llm_type(self):
        return "scripted"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        start = max(i for i, m in enumerate(messages) if m.type == "human")
        results = [m for m in messages[start:] if isinstance(m, ToolMessage)]
        step = len(results)
        result_id = lambda n: int(re.search(r"result_id: (\d+)", results[n].content).group(1))
        call = lambda name, args: AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": f"c{step}-{len(messages)}"}])
        script = [
            lambda: call("read_file", {"file_path": "/football-data/SKILL.md", "limit": 1000}),
            lambda: call("run_query", {"sql": TOP_SCORERS}),
            lambda: call("run_query", {"sql": "SELECT 1; DROP TABLE matches"}),
            lambda: call("run_query", {"sql": "DELETE FROM matches WHERE match_id = 1"}),
            lambda: call("add_to_dashboard", {"result_id": result_id(1), "title": "Top scorers at the 2026 World Cup",
                                              "view": "bar", "x": "scorer", "y": ["goals"]}),
            lambda: call("run_query", {"sql": GOALS_PER_MATCH}),
            lambda: call("add_to_dashboard", {"result_id": result_id(5), "title": "Goals per match at each World Cup, 1930 to 2026",
                                              "view": "line", "x": "year", "y": ["goals_per_match"]}),
        ]
        if step < len(script):
            message = script[step]()
        else:
            message = AIMessage(content="Scripted answer: the model is a stand-in, so no API call was made.",
                                usage_metadata={"input_tokens": 100, "output_tokens": 10, "total_tokens": 110})
        return ChatResult(generations=[ChatGeneration(message=message)])


langchain_openai.ChatOpenAI = ScriptedModel
