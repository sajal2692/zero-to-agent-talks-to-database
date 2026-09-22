// The middle panel: each question, the agent's work, and its answer.

import { useEffect, useRef, useState } from "react";

const STARTERS = [
  "Who scored the most goals at the 2026 World Cup? Show me a chart.",
  "Has the World Cup become more or less goal-heavy over the decades?",
  "How did Spain get to the 2026 final?",
  "Which clubs sent the most players to the 2026 World Cup?",
];

// The backend sends a flat list of events. Group them into turns: one question, the steps the
// agent took, and its answer.
function toTurns(events) {
  const turns = [];
  for (const event of events) {
    if (event.type === "question") {
      turns.push({ question: event.text, steps: [], answer: null, done: null, error: null });
    } else if (turns.length) {
      const turn = turns[turns.length - 1];
      if (event.type === "answer") turn.answer = event.text;
      else if (event.type === "done") turn.done = event;
      else if (event.type === "error") turn.error = event.text;
      else turn.steps.push(event);
    }
  }
  return turns;
}

// One line for the collapsed "Show work" row, for example "1 skill · 2 queries, 1 retried".
function summarize(steps) {
  const skills = steps.filter((s) => s.type === "skill").length;
  const results = steps.filter((s) => s.type === "rows");
  const retried = results.filter((r) => r.error || r.row_count === 0).length;
  const items = steps.filter((s) => s.type === "artifact").length;
  const parts = [];
  if (skills) parts.push(`${skills} skill${skills > 1 ? "s" : ""}`);
  if (results.length) parts.push(`${results.length} quer${results.length > 1 ? "ies" : "y"}${retried ? `, ${retried} retried` : ""}`);
  if (items) parts.push(`${items} dashboard item${items > 1 ? "s" : ""}`);
  return parts.join(" · ") || "Thinking";
}

// What the agent is doing right now, shown on the collapsed row while it works.
function latest(steps) {
  const step = steps[steps.length - 1];
  if (!step) return "Thinking";
  if (step.type === "skill") return `Reading the ${step.name} skill`;
  if (step.type === "plan") return "Planning";
  if (step.type === "sql") return "Running a query";
  if (step.type === "rows") return step.error ? "Query failed, fixing it" : `${step.row_count} rows back`;
  if (step.type === "artifact") return "Adding to the dashboard";
  return "Thinking";
}

function SqlStep({ step, result }) {
  let badge = <span className="badge">running</span>;
  if (result && result.error) badge = <span className="badge warn">error · {result.ms} ms</span>;
  else if (result) {
    const cls = result.row_count === 0 ? "badge warn" : "badge good";
    badge = <span className={cls}>{result.row_count}{result.truncated ? "+" : ""} rows · {result.ms} ms</span>;
  }
  return (
    <div className="sql">
      <div className="sql-top"><span>run_query</span>{badge}</div>
      <pre>{step.sql}</pre>
      {result && result.error && <div className="sql-error">{result.error}</div>}
    </div>
  );
}

function Step({ step, steps, artifacts }) {
  if (step.type === "thinking") return <div className="thinking">{step.text}</div>;
  if (step.type === "skill") return <div className="step"><i />Read skill <b>{step.name}</b></div>;
  if (step.type === "note") return <div className="step"><i />{step.text}</div>;
  if (step.type === "plan") {
    return (
      <ul className="plan">
        {step.todos.map((todo, i) => <li key={i} className={todo.status}>{todo.content}</li>)}
      </ul>
    );
  }
  if (step.type === "sql") {
    const result = steps.find((s) => s.type === "rows" && s.id === step.id);
    return <SqlStep step={step} result={result} />;
  }
  if (step.type === "artifact") {
    const artifact = artifacts.find((a) => a.id === step.artifact_id);
    return <div className="step"><i />Added <b>{artifact ? artifact.title : "an item"}</b> to the dashboard</div>;
  }
  return null; // "rows" events are shown inside their query
}

function Turn({ turn, artifacts, live }) {
  const [open, setOpen] = useState(false);
  const cost = turn.done;
  return (
    <>
      <div className="user">{turn.question}</div>
      <button className="work" onClick={() => setOpen(!open)}>
        <span><b>{open ? "Hide work" : "Show work"}</b> {live ? latest(turn.steps) : summarize(turn.steps)}</span>
        <span className="chevron">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="steps">
          {turn.steps.map((step, i) => <Step key={i} step={step} steps={turn.steps} artifacts={artifacts} />)}
        </div>
      )}
      {turn.answer && <div className="answer">{turn.answer}</div>}
      {turn.error && <div className="sql-error">{turn.error}</div>}
      {cost && (
        <div className="cost">
          {cost.model_requests} model calls · {cost.seconds} s · {cost.input_tokens + cost.cached_input_tokens + cost.output_tokens} tokens · ${cost.cost_usd.toFixed(3)}
        </div>
      )}
    </>
  );
}

export default function Chat({ title, events, artifacts, running, onAsk }) {
  const [text, setText] = useState("");
  const bottom = useRef(null);
  const turns = toTurns(events);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  function send(question) {
    if (!question.trim() || running) return;
    onAsk(question.trim());
    setText("");
  }

  return (
    <main className="chat">
      <header className="chat-head"><b>{title}</b><span>gpt-6-sol</span></header>
      <div className="messages">
        {turns.length === 0 && (
          <div className="empty">
            <h2>Ask about 150 years of international football</h2>
            <p>Every men's international match since 1872, and every goal at the 2026 World Cup.</p>
            {STARTERS.map((q) => <button key={q} className="starter" onClick={() => send(q)}>{q}</button>)}
          </div>
        )}
        {turns.map((turn, i) => (
          <Turn key={i} turn={turn} artifacts={artifacts} live={running && i === turns.length - 1} />
        ))}
        <div ref={bottom} />
      </div>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea
          value={text}
          rows={2}
          placeholder={running ? "The agent is working…" : "Ask a question or a follow-up"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
        />
        <button disabled={running || !text.trim()}>Ask</button>
      </form>
    </main>
  );
}
