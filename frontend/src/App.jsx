// The page: sessions on the left, the chat in the middle, the dashboard on the right.
// All state lives here and flows down to the three panels.

import { useEffect, useState } from "react";
import * as api from "./api.js";
import Sessions from "./Sessions.jsx";
import Chat from "./Chat.jsx";
import Dashboard from "./Dashboard.jsx";

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [events, setEvents] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [running, setRunning] = useState(false);

  // 1. Load the session list once, and open the newest session.
  useEffect(() => {
    api.listSessions().then((list) => {
      setSessions(list);
      if (list.length) setCurrentId(list[0].id);
    });
  }, []);

  // 2. When the session changes, load its chat history and dashboard.
  useEffect(() => {
    if (!currentId) return;
    api.getSession(currentId).then((data) => {
      setEvents(data.events);
      setArtifacts(data.artifacts);
    });
  }, [currentId]);

  async function newSession() {
    const session = await api.createSession();
    setSessions([session, ...sessions]);
    setCurrentId(session.id);
    setEvents([]);
    setArtifacts([]);
    return session;
  }

  async function removeSession(id) {
    await api.deleteSession(id);
    const rest = sessions.filter((s) => s.id !== id);
    setSessions(rest);
    if (id === currentId) {
      setCurrentId(rest.length ? rest[0].id : null);
      setEvents([]);
      setArtifacts([]);
    }
  }

  // 3. Ask a question. Each streamed event is added to the chat as it arrives, and each new
  //    dashboard item is fetched with its rows and SQL.
  async function askQuestion(text) {
    const session = currentId ? sessions.find((s) => s.id === currentId) : await newSession();
    setRunning(true);
    setEvents((old) => [...old, { type: "question", text }]);
    await api.ask(session.id, text, async (event) => {
      setEvents((old) => [...old, event]);
      if (event.type === "artifact") {
        const artifact = await api.getArtifact(event.artifact_id);
        setArtifacts((old) => [...old, artifact]);
      }
    });
    setRunning(false);
    setSessions(await api.listSessions()); // picks up the title from the first question
  }

  const current = sessions.find((s) => s.id === currentId);
  return (
    <div className="app">
      <Sessions
        sessions={sessions}
        currentId={currentId}
        onSelect={setCurrentId}
        onNew={newSession}
        onDelete={removeSession}
      />
      <Chat
        title={current ? current.title : "New session"}
        events={events}
        artifacts={artifacts}
        running={running}
        onAsk={askQuestion}
      />
      <Dashboard artifacts={artifacts} />
    </div>
  );
}
