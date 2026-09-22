// Draws one dashboard item with Apache ECharts. The rows come from the database result the
// agent referred to, and the agent only chose the view and the columns.

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

const COLORS = ["#336791", "#E3A33B", "#2F9C95", "#D9644A", "#7B61C9", "#5B9BD5", "#8C9A3B"];
const INK = "#1A2433";
const MUTED = "#5F6B7A";
const GRID = "#E3E8EF";
const FONT = { fontFamily: "Inter, system-ui, sans-serif" };

// Column names from SQL, shown as labels: "goals_per_match" becomes "Goals per match".
export function columnLabel(name) {
  return name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// 12,345 in tooltips and labels, 12K on axes.
export const formatNumber = (v) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v);
const compact = (v) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

// A vertical fade from a colour to a lighter version of itself.
function fade(color, horizontal = false) {
  return new echarts.graphic.LinearGradient(0, 0, horizontal ? 1 : 0, horizontal ? 0 : 1, [
    { offset: 0, color: horizontal ? color + "CC" : color },
    { offset: 1, color: horizontal ? color : color + "B3" },
  ]);
}

function buildOption({ view, x, y, columns, rows }) {
  const column = (name) => rows.map((row) => row[columns.indexOf(name)]);
  const labels = column(x).map(String);
  const overTime = column(x).every((value) => typeof value === "number" || /^\d{4}/.test(value));
  const base = {
    color: COLORS,
    textStyle: FONT,
    animationDuration: 600,
    tooltip: {
      trigger: ["pie", "scatter", "treemap"].includes(view) ? "item" : "axis",
      backgroundColor: "#fff", borderColor: GRID, textStyle: { color: INK, ...FONT },
      extraCssText: "box-shadow: 0 6px 20px rgba(26, 36, 51, .12); border-radius: 8px;",
      valueFormatter: formatNumber, axisPointer: { type: "shadow", shadowStyle: { color: "rgba(51, 103, 145, .06)" } },
    },
    legend: y.length > 1 ? { top: 0, icon: "circle", itemWidth: 9, textStyle: { color: MUTED, ...FONT } } : undefined,
    grid: { left: 8, right: 36, top: y.length > 1 ? 34 : 14, bottom: 8, containLabel: true },
  };
  const valueAxis = {
    type: "value", splitLine: { lineStyle: { color: GRID, type: "dashed" } },
    axisLabel: { color: MUTED, formatter: compact, ...FONT },
  };
  const categoryAxis = {
    type: "category", data: labels, axisTick: { show: false },
    axisLine: { lineStyle: { color: GRID } }, axisLabel: { color: overTime ? MUTED : INK, ...FONT },
  };
  const everyLabel = { ...categoryAxis, axisLabel: { ...categoryAxis.axisLabel, interval: 0 } }; // ranked names

  // 1. Pie: one slice per row, as a ring with the share on each label.
  if (view === "pie") {
    const values = column(y[0]);
    return { ...base, legend: undefined, series: [{
      type: "pie", radius: ["48%", "74%"], center: ["50%", "54%"], padAngle: 1.5,
      itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
      label: { formatter: "{b}\n{d}%", color: INK, ...FONT }, labelLine: { length: 10, length2: 8 },
      data: labels.map((name, i) => ({ name, value: values[i] })),
    }] };
  }

  // 2. Treemap: one tile per row, sized by the first y column. Good for shares with many parts.
  if (view === "treemap") {
    const values = column(y[0]);
    return { ...base, legend: undefined, series: [{
      type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
      width: "100%", height: "100%", top: 0, left: 0,
      itemStyle: { borderColor: "#fff", borderWidth: 2, gapWidth: 2, borderRadius: 4 },
      label: { formatter: (p) => `${p.name}\n${formatNumber(p.value)}`, color: "#fff", fontWeight: 600, ...FONT },
      levels: [{ colorSaturation: [0.35, 0.6] }],
      data: labels.map((name, i) => ({ name, value: values[i], itemStyle: { color: COLORS[i % COLORS.length] } })),
    }] };
  }

  // 3. Scatter: y[0] across, y[1] up, and the x column names each point.
  if (view === "scatter") {
    const across = column(y[0]), up = column(y[1] ?? y[0]);
    return { ...base,
      xAxis: { ...valueAxis, name: columnLabel(y[0]), nameLocation: "middle", nameGap: 28 },
      yAxis: { ...valueAxis, name: columnLabel(y[1] ?? y[0]) },
      tooltip: { ...base.tooltip, trigger: "item", formatter: (p) =>
        `<b>${labels[p.dataIndex]}</b><br/>${columnLabel(y[0])}: ${formatNumber(p.value[0])}<br/>${columnLabel(y[1] ?? y[0])}: ${formatNumber(p.value[1])}` },
      series: [{ type: "scatter", symbolSize: 12, itemStyle: { color: COLORS[0], opacity: 0.8, borderColor: "#fff" },
        data: across.map((a, i) => [a, up[i]]) }] };
  }

  // 4. Line and area: time along the bottom. A single line gets a shaded area and its last value.
  if (view === "line" || view === "area") {
    const single = y.length === 1;
    return { ...base, xAxis: { ...categoryAxis, boundaryGap: false }, yAxis: valueAxis,
      tooltip: { ...base.tooltip, axisPointer: { type: "line", lineStyle: { color: GRID } } },
      series: y.map((name, i) => {
        const color = COLORS[i % COLORS.length];
        return {
          name: columnLabel(name), type: "line", smooth: 0.3, smoothMonotone: "x", symbol: "circle", symbolSize: 6,
          data: column(name), color, lineStyle: { width: 3 },
          stack: view === "area" && !single ? "total" : undefined,
          areaStyle: view === "area" || single
            ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: color + "59" }, { offset: 1, color: color + "05" }]) }
            : undefined,
          endLabel: single ? { show: true, formatter: (p) => formatNumber(p.value), color, fontWeight: 700, ...FONT } : undefined,
          emphasis: { focus: "series" },
        };
      }) };
  }

  // 5. Bar and stacked bar: horizontal for rankings of names, vertical for years.
  const stacked = view === "stacked_bar";
  const bars = y.map((name, i) => ({
    name: columnLabel(name), type: "bar", data: column(name), barMaxWidth: 22,
    stack: stacked ? "total" : undefined,
    itemStyle: {
      color: stacked ? COLORS[i % COLORS.length] : fade(COLORS[i % COLORS.length], !overTime),
      borderRadius: stacked ? 0 : overTime ? [5, 5, 0, 0] : [0, 5, 5, 0],
    },
    label: {
      show: !stacked && y.length === 1 && rows.length <= 20, position: overTime ? "top" : "right",
      formatter: (p) => formatNumber(p.value), color: INK, fontWeight: 600, ...FONT,
    },
    emphasis: { focus: "series" },
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
