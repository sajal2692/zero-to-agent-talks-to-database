// Draws one dashboard item with Apache ECharts. The rows come from the database result the
// agent referred to, and the agent only chose the view and the columns.

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

const COLORS = ["#336791", "#E3A33B", "#5B9BD5", "#2F7D5B", "#8E6CC0"];
const INK = "#1A2433";
const MUTED = "#5F6B7A";
const GRID = "#E3E8EF";
const FONT = { fontFamily: "Inter, system-ui, sans-serif" };

function buildOption({ view, x, y, columns, rows }) {
  const column = (name) => rows.map((row) => row[columns.indexOf(name)]);
  const labels = column(x).map(String);
  const overTime = column(x).every((value) => typeof value === "number" || /^\d{4}/.test(value));
  const base = {
    color: COLORS,
    textStyle: FONT,
    animationDuration: 500,
    tooltip: { trigger: view === "pie" || view === "scatter" ? "item" : "axis" },
    legend: y.length > 1 ? { top: 0, textStyle: FONT } : undefined,
    grid: { left: 8, right: 28, top: y.length > 1 ? 32 : 12, bottom: 8, containLabel: true },
  };
  const valueAxis = { type: "value", splitLine: { lineStyle: { color: GRID } }, axisLabel: { color: MUTED, ...FONT } };
  const categoryAxis = {
    type: "category", data: labels, axisTick: { show: false },
    axisLine: { lineStyle: { color: GRID } }, axisLabel: { color: overTime ? MUTED : INK, ...FONT },
  };
  const everyLabel = { ...categoryAxis, axisLabel: { ...categoryAxis.axisLabel, interval: 0 } }; // ranked names

  // 1. Pie: one slice per row.
  if (view === "pie") {
    const values = column(y[0]);
    return { ...base, series: [{ type: "pie", radius: ["45%", "72%"],
      data: labels.map((name, i) => ({ name, value: values[i] })), label: { formatter: "{b}: {c}", ...FONT } }] };
  }

  // 2. Scatter: y[0] across, y[1] up, and the x column names each point.
  if (view === "scatter") {
    const across = column(y[0]), up = column(y[1] ?? y[0]);
    return { ...base,
      xAxis: { ...valueAxis, name: y[0], nameLocation: "middle", nameGap: 28 },
      yAxis: { ...valueAxis, name: y[1] },
      tooltip: { trigger: "item", formatter: (p) => `${labels[p.dataIndex]}<br/>${y[0]}: ${p.value[0]}<br/>${y[1]}: ${p.value[1]}` },
      series: [{ type: "scatter", symbolSize: 11, data: across.map((a, i) => [a, up[i]]) }] };
  }

  // 3. Line and area: time along the bottom.
  if (view === "line" || view === "area") {
    return { ...base, xAxis: categoryAxis, yAxis: valueAxis,
      series: y.map((name, i) => ({
        name, type: "line", smooth: true, symbolSize: 6, data: column(name), lineStyle: { width: 3 },
        areaStyle: view === "area" || y.length === 1 ? { opacity: view === "area" ? 0.35 : 0.12 } : undefined,
        color: COLORS[i % COLORS.length],
      })) };
  }

  // 4. Bar: horizontal for rankings of names, vertical for years.
  const bars = y.map((name) => ({
    name, type: "bar", data: column(name), barMaxWidth: 18,
    itemStyle: { borderRadius: overTime ? [4, 4, 0, 0] : [0, 4, 4, 0] },
    label: { show: y.length === 1 && rows.length <= 20, position: overTime ? "top" : "right", color: INK, fontWeight: 600, ...FONT },
  }));
  return overTime
    ? { ...base, xAxis: categoryAxis, yAxis: valueAxis, series: bars }
    : { ...base, xAxis: valueAxis, yAxis: { ...everyLabel, inverse: true }, series: bars };
}

export default function Chart({ artifact }) {
  const ref = useRef(null);
  useEffect(() => {
    const chart = echarts.init(ref.current);
    document.fonts.ready.then(() => chart.setOption(buildOption(artifact)));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [artifact]);
  return <div ref={ref} className="chart" />;
}
