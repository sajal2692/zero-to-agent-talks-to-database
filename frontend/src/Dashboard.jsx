// The right panel: every chart and table the agent added. Click an item to turn it over and
// see the SQL behind it, and click again to turn it back. Selecting SQL text does not flip it.

import { useEffect, useRef, useState } from "react";
import Chart, { columnLabel, formatNumber } from "./Chart.jsx";
import { formatSql } from "./sql.js";

function Table({ artifact }) {
  // A column is numeric when every value in it is a number. Numeric columns sit right-aligned,
  // header included, and take only the width they need.
  const numeric = artifact.columns.map((_, j) =>
    artifact.rows.every((row) => row[j] === null || typeof row[j] === "number"));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {artifact.columns.map((c, j) => <th key={c} className={numeric[j] ? "num" : ""}>{columnLabel(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {artifact.rows.slice(0, 200).map((row, i) => (
            <tr key={i}>
              {row.map((value, j) => <td key={j} className={numeric[j] ? "num" : ""}>{numeric[j] ? formatNumber(value) : String(value ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Headline numbers: one tile per y column, from the first row. The x column, if any, labels them.
function Stats({ artifact }) {
  const row = artifact.rows[0] || [];
  const names = artifact.y.length ? artifact.y : artifact.columns;
  const caption = artifact.x ? row[artifact.columns.indexOf(artifact.x)] : null;
  return (
    <div className="stats">
      {names.map((name) => (
        <div key={name} className="stat">
          <div className="stat-value">{formatNumber(row[artifact.columns.indexOf(name)])}</div>
          <div className="stat-label">{columnLabel(name)}{caption ? ` · ${caption}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

function Item({ artifact }) {
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);

  function copySql(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(artifact.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  const wide = ["line", "area", "table", "stacked_bar", "treemap"].includes(artifact.view);
  // A bar chart with many rows gets taller, so every name keeps its label.
  const height = ["bar", "stacked_bar"].includes(artifact.view) && artifact.row_count > 10 && !showSql
    ? { height: Math.min(640, 130 + artifact.row_count * 24) } : undefined;
  const rows = `${artifact.row_count}${artifact.truncated ? "+" : ""} row${artifact.row_count === 1 ? "" : "s"}`;
  return (
    <section className={`item view-${artifact.view} ${wide ? "wide" : ""}`} style={height}
             onClick={() => { if (!window.getSelection().toString()) setShowSql(!showSql); }}>
      <div className="item-head">
        <span>{artifact.title}</span>
        <button className="chip">
          {showSql ? "Chart" : "SQL"}
        </button>
      </div>
      <div className="item-sub">{showSql ? `The SQL behind this item · ${rows}` : rows}</div>
      {showSql ? (
        <>
          <pre className="item-sql">{formatSql(artifact.sql)}</pre>
          <button className={copied ? "copy done" : "copy"} onClick={copySql}>
            {copied ? "Copied" : "Copy SQL"}
          </button>
        </>
      ) : artifact.view === "table" ? (
        <Table artifact={artifact} />
      ) : artifact.view === "stat" ? (
        <Stats artifact={artifact} />
      ) : (
        <Chart artifact={artifact} />
      )}
    </section>
  );
}

export default function Dashboard({ artifacts }) {
  const newestFirst = [...artifacts].reverse();
  const panel = useRef(null);

  // The newest item goes at the top, so scroll back up when one arrives.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [artifacts.length]);

  return (
    <div className="dashboard" ref={panel}>
      <div className="dash-head">
        <b>Dashboard</b>
        <span>{artifacts.length ? `${artifacts.length} items · click an item to see its SQL` : "Charts and tables from your questions appear here"}</span>
      </div>
      <div className="grid">
        {newestFirst.map((artifact) => <Item key={artifact.id} artifact={artifact} />)}
      </div>
    </div>
  );
}
