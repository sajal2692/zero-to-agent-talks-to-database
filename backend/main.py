"""The web API that the React frontend calls.

Run inside Docker with the rest of the app (see the README), or on its own with:
    uv run uvicorn main:app --reload
"""

import json
import time
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import BaseModel

import store
from agent import agent, log, pool, usage_and_cost

RUNS_DIR = Path(__file__).resolve().parent / "runs"   # a JSON copy of each question's cost, for the instructor

app = FastAPI()


class Question(BaseModel):
    text: str


def to_events(message):
    """Turn one agent message into the events the chat shows. Used when streaming and for history."""
    events = []
    if isinstance(message, HumanMessage):
        events.append({"type": "question", "text": message.text})
    elif isinstance(message, AIMessage):
        for block in message.content_blocks:
            if block["type"] == "reasoning" and block.get("reasoning"):
                events.append({"type": "thinking", "text": block["reasoning"].replace("**", "")})
        for call in message.tool_calls:
            args = call["args"]
            if call["name"] == "run_query":
                events.append({"type": "sql", "id": call["id"], "sql": args.get("sql", "")})
            elif call["name"] == "write_todos":
                events.append({"type": "plan", "todos": args.get("todos", [])})
            elif call["name"] == "read_file" and args.get("file_path", "").endswith("SKILL.md"):
                events.append({"type": "skill", "name": args["file_path"].strip("/").split("/")[0]})
        if message.text:
            events.append({"type": "answer" if not message.tool_calls else "note", "text": message.text})
    elif isinstance(message, ToolMessage) and message.artifact:
        if message.name == "run_query":
            events.append({"type": "rows", "id": message.tool_call_id, **message.artifact})
        elif message.name == "add_to_dashboard":
            events.append({"type": "artifact", "artifact_id": message.artifact["artifact_id"]})
    return events


def log_event(event):
    """The model's side of the loop. The DATABASE lines come from the query tool itself."""
    if event["type"] == "thinking":
        log("AGENT", "Thinking", event["text"][:400])
    elif event["type"] == "plan":
        log("AGENT", "Plan", "\n".join(f"[{t.get('status', '')}] {t.get('content', '')}" for t in event["todos"]))
    elif event["type"] == "skill":
        log("AGENT", f"Reads skill: {event['name']}")
    elif event["type"] in ("answer", "note"):
        log("AGENT", "Answer" if event["type"] == "answer" else "Note", event["text"])
    elif event["type"] == "artifact":
        log("APP", f"Dashboard item {event['artifact_id']} added")


def sse(event):
    return f"data: {json.dumps(event, default=str)}\n\n"


# 1. Sessions, like chats in ChatGPT or Claude. Each one has its own conversation and dashboard.

@app.get("/api/sessions")
def list_sessions():
    return store.list_sessions(pool)


@app.post("/api/sessions")
def create_session():
    return store.create_session(pool)


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    store.delete_session(pool, session_id)
    return {"deleted": session_id}


# 2. One session: its chat history rebuilt from the agent's memory, its dashboard, and the cost
#    of each question.

@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    session = store.get_session(pool, session_id)
    if not session:
        raise HTTPException(404, "No such session")
    state = agent.get_state({"configurable": {"thread_id": session_id}})
    events = [event for message in state.values.get("messages", []) for event in to_events(message)]
    return {
        "session": session,
        "events": events,
        "artifacts": store.list_artifacts(pool, session_id),
        "runs": store.list_runs(pool, session_id),
    }


@app.get("/api/artifacts/{artifact_id}")
def get_artifact(artifact_id: int):
    artifact = store.get_artifact(pool, artifact_id)
    if not artifact:
        raise HTTPException(404, "No such artifact")
    return artifact


# 3. Ask a question. The answer streams back as server-sent events, one per step of the loop,
#    so the chat can show the SQL while the agent is still working.

@app.post("/api/sessions/{session_id}/ask")
def ask(session_id: str, question: Question):
    session = store.get_session(pool, session_id)
    if not session:
        raise HTTPException(404, "No such session")
    if session["title"] == "New session":
        title = question.text if len(question.text) <= 60 else question.text[:57].rsplit(" ", 1)[0] + "…"
        store.rename_session(pool, session_id, title)

    def stream():
        log("APP", f"Question in session {session_id}", question.text)
        started = time.time()
        produced = []
        config = {"configurable": {"thread_id": session_id}, "recursion_limit": 100}
        try:
            for update in agent.stream({"messages": [{"role": "user", "content": question.text}]},
                                       config=config, stream_mode="updates"):
                for state in update.values():
                    messages = state.get("messages", []) if isinstance(state, dict) else []
                    for message in messages if isinstance(messages, list) else []:
                        produced.append(message)
                        for event in to_events(message):
                            log_event(event)
                            yield sse(event)
        except Exception as e:  # show the failure in the chat instead of a dropped connection
            log("APP", "Error", repr(e))
            yield sse({"type": "error", "text": str(e)})

        # 4. What this question cost: saved in the app database, copied to runs/, logged, and
        #    shown at the foot of the answer.
        summary = usage_and_cost(produced, time.time() - started)
        store.save_run(pool, session_id, question.text, summary)
        RUNS_DIR.mkdir(exist_ok=True)
        (RUNS_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{session_id}.json").write_text(
            json.dumps({"question": question.text, **summary}, indent=2))
        log("APP", "Run summary", json.dumps(summary, indent=2))
        yield sse({"type": "done", **summary})

    return StreamingResponse(stream(), media_type="text/event-stream")
