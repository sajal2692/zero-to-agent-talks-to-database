// The left rail: a list of sessions, like the chat list in ChatGPT or Claude.

export default function Sessions({ sessions, currentId, onSelect, onNew, onDelete, onClose }) {
  return (
    <aside className="rail">
      <div className="brand">
        <div>
          Football data agent
          <small>Postgres, 49,547 matches since 1872</small>
        </div>
        <button className="icon-button" title="Hide sessions" onClick={onClose}>‹</button>
      </div>
      <button className="new" onClick={onNew}>+ New session</button>
      <div className="label">Sessions</div>
      {sessions.map((session) => (
        <div
          key={session.id}
          className={session.id === currentId ? "session on" : "session"}
          onClick={() => onSelect(session.id)}
        >
          <span>{session.title}</span>
          <button
            className="delete"
            title="Delete session"
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
          >
            ×
          </button>
        </div>
      ))}
    </aside>
  );
}
