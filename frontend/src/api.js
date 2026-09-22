// Every call the frontend makes to the backend. The backend is in backend/main.py.

export async function listSessions() {
  return (await fetch("/api/sessions")).json();
}

export async function createSession() {
  return (await fetch("/api/sessions", { method: "POST" })).json();
}

export async function deleteSession(id) {
  await fetch(`/api/sessions/${id}`, { method: "DELETE" });
}

// A session's chat history and dashboard items.
export async function getSession(id) {
  return (await fetch(`/api/sessions/${id}`)).json();
}

export async function getArtifact(id) {
  return (await fetch(`/api/artifacts/${id}`)).json();
}

// Ask a question. The backend streams server-sent events, one per step of the agent's loop,
// and onEvent is called with each one as it arrives.
export async function ask(sessionId, text, onEvent) {
  const response = await fetch(`/api/sessions/${sessionId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      if (part.startsWith("data: ")) onEvent(JSON.parse(part.slice(6)));
    }
  }
}
