// The model often writes a query on one line. For display, break it before each main clause,
// outside brackets and quotes. The SQL that ran is unchanged, and "Copy SQL" copies it as sent.

const CLAUSE = /^(WITH|SELECT|FROM|(?:LEFT |RIGHT |INNER |FULL )?JOIN|WHERE|AND|GROUP BY|HAVING|ORDER BY|LIMIT|UNION)\b/i;

export function formatSql(sql) {
  if (sql.includes("\n")) return sql;
  let out = "";
  let depth = 0;
  let quoted = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    const clause = ch === " " && depth === 0 && !quoted && sql.slice(i + 1).match(CLAUSE);
    if (clause) {
      out += (clause[1].toUpperCase() === "AND" ? "\n  " : "\n") + clause[1];
      i += 1 + clause[1].length;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}
