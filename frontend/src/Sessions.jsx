// The left rail: a list of sessions, like the chat list in ChatGPT or Claude.
// Each session has a delete button, which asks before it deletes.

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

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
            aria-label={`Delete session: ${session.title}`}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete "${session.title}"? Its chat and dashboard will be removed.`)) onDelete(session.id);
            }}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
    </aside>
  );
}
