"""Checks the backend end to end with a scripted model in place of OpenAI. Costs nothing.

Needs the database container running. From backend/:
    uv run python tests/smoke_test.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scripted_model  # noqa: E402,F401  (replaces the OpenAI model before agent.py is imported)
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)
session = client.post("/api/sessions").json()
events = []
with client.stream("POST", f"/api/sessions/{session['id']}/ask", json={"text": "Top scorers in 2026?"}) as r:
    for line in r.iter_lines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))

types = [e["type"] for e in events]
rows = [e for e in events if e["type"] == "rows"]
print("events:", types)
assert "skill" in types and types.count("artifact") == 2 and types[-1] == "done", types
assert rows[0].get("row_count", 0) > 0, rows[0]
assert "multiple commands" in rows[1]["error"], rows[1]
assert "permission denied for table matches" in rows[2]["error"], rows[2]

detail = client.get(f"/api/sessions/{session['id']}").json()
assert detail["session"]["title"] == "Top scorers in 2026?"
assert len(detail["artifacts"]) == 2 and detail["artifacts"][0]["rows"], detail["artifacts"]
assert [e["type"] for e in detail["events"]][0] == "question"
print("top scorers:", detail["artifacts"][0]["rows"][:3])
client.delete(f"/api/sessions/{session['id']}")
print("OK")
