// The page: sessions on the left, the chat in the middle, the dashboard on the right.
// All state lives here and flows down to the three panels. On narrow screens the sessions
// slide in over the page, and the chat and dashboard switch with tabs (see styles.css).

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
  const [runs, setRuns] = useState([]);          // the cost of each earlier question in this session
  const [running, setRunning] = useState(false);
  const [railOpen, setRailOpen] = useState(window.innerWidth > 1100);
  const [tab, setTab] = useState("chat");   // which panel shows on a phone
  const [unseen, setUnseen] = useState(0);   // new dashboard items while the chat tab is showing

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
      setRuns(data.runs);
    });
  }, [currentId]);

  function selectSession(id) {
    setCurrentId(id);
    if (window.innerWidth <= 1100) setRailOpen(false);
  }

  function showTab(name) {
    setTab(name);
    if (name === "dashboard") setUnseen(0);
  }

  async function newSession() {
    if (window.innerWidth <= 1100) setRailOpen(false);
    const session = await api.createSession();
    setSessions([session, ...sessions]);
    setCurrentId(session.id);
    setEvents([]);
    setArtifacts([]);
    setRuns([]);
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
      setRuns([]);
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
        setUnseen((n) => n + 1);
      }
    });
    setRunning(false);
    setSessions(await api.listSessions()); // picks up the title from the first question
  }

  const current = sessions.find((s) => s.id === currentId);
  return (
    <div className={`app ${railOpen ? "rail-open" : ""} show-${tab}`}>
      <Sessions
        sessions={sessions}
        currentId={currentId}
        onSelect={selectSession}
        onNew={newSession}
        onDelete={removeSession}
        onClose={() => setRailOpen(false)}
      />
      <div className="backdrop" onClick={() => setRailOpen(false)} />
      <Chat
        title={current ? current.title : "New session"}
        events={events}
        artifacts={artifacts}
        runs={runs}
        running={running}
        onAsk={askQuestion}
        onMenu={() => setRailOpen(!railOpen)}
      />
      <Dashboard artifacts={artifacts} />
      <nav className="tabs">
        <button className={tab === "chat" ? "on" : ""} onClick={() => showTab("chat")}>Chat</button>
        <button className={tab === "dashboard" ? "on" : ""} onClick={() => showTab("dashboard")}>
          Dashboard{unseen && tab !== "dashboard" ? <span className="count">{unseen}</span> : null}
        </button>
      </nav>
    </div>
  );
}
