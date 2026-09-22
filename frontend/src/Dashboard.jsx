// The right panel: every chart and table the agent added. Click an item to turn it over and
// see the SQL behind it.

import { useEffect, useRef, useState } from "react";
import Chart from "./Chart.jsx";
import { formatSql } from "./sql.js";

function Table({ artifact }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{artifact.columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {artifact.rows.slice(0, 200).map((row, i) => (
            <tr key={i}>{row.map((value, j) => <td key={j} className={typeof value === "number" ? "num" : ""}>{String(value ?? "")}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Item({ artifact }) {
  const [showSql, setShowSql] = useState(false);
  const wide = ["line", "area", "table"].includes(artifact.view);
  // A bar chart with many rows gets taller, so every name keeps its label.
  const height = artifact.view === "bar" && artifact.row_count > 10 && !showSql
    ? { height: Math.min(640, 130 + artifact.row_count * 24) } : undefined;
  const rows = `${artifact.row_count}${artifact.truncated ? "+" : ""} row${artifact.row_count === 1 ? "" : "s"}`;
  return (
    <section className={`item view-${artifact.view} ${wide ? "wide" : ""}`} style={height}
             onClick={() => !showSql && setShowSql(true)}>
      <div className="item-head">
        <span>{artifact.title}</span>
        <button className="chip" onClick={(e) => { e.stopPropagation(); setShowSql(!showSql); }}>
          {showSql ? "Chart" : "SQL"}
        </button>
      </div>
      <div className="item-sub">{showSql ? `The SQL behind this item · ${rows}` : rows}</div>
      {showSql ? (
        <>
          <pre className="item-sql">{formatSql(artifact.sql)}</pre>
          <button className="copy" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(artifact.sql); }}>
            Copy SQL
          </button>
        </>
      ) : artifact.view === "table" ? (
        <Table artifact={artifact} />
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
