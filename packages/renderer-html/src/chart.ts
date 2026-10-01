import type { ResolvedChartComponent } from "@reporting/core";
import { escapeHtml } from "./escape.js";

/**
 * Charts compile to plain inline SVG rather than a charting library, so the
 * same markup is deterministic across machines and trivially reusable by the
 * PDF renderer (which can embed the exact same SVG). This is intentionally
 * minimal -- bar/line/pie only, no animation, no interaction -- matching the
 * spec's "charts may initially be rendered as SVG/images" allowance.
 */
const PALETTE = ["#4F46E5", "#059669", "#D97706", "#DC2626", "#2563EB", "#7C3AED"];

export function renderChartSvg(chart: ResolvedChartComponent, width: number, height: number): string {
  switch (chart.chartType) {
    case "bar":
      return renderBarChart(chart, width, height);
    case "line":
      return renderLineChart(chart, width, height);
    case "pie":
      return renderPieChart(chart, width, height);
    default:
      return `<svg width="${width}" height="${height}"></svg>`;
  }
}

function allValues(chart: ResolvedChartComponent): number[] {
  return chart.series.flatMap((s) => s.values);
}

function renderBarChart(chart: ResolvedChartComponent, width: number, height: number): string {
  const values = allValues(chart);
  const max = Math.max(1, ...values);
  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;
  const groups = chart.categories.length || 1;
  const groupWidth = chartW / groups;
  const seriesCount = Math.max(1, chart.series.length);
  const barWidth = (groupWidth * 0.8) / seriesCount;

  const bars = chart.series.flatMap((series, si) =>
    series.values.map((value, ci) => {
      const barHeight = (value / max) * chartH;
      const x = padding + ci * groupWidth + groupWidth * 0.1 + si * barWidth;
      const y = padding + (chartH - barHeight);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="${PALETTE[si % PALETTE.length]}" />`;
    })
  );

  const axis = `<line x1="${padding}" y1="${padding + chartH}" x2="${width - padding}" y2="${padding + chartH}" stroke="#999" />`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${axis}${bars.join("")}</svg>`;
}

function renderLineChart(chart: ResolvedChartComponent, width: number, height: number): string {
  const values = allValues(chart);
  const max = Math.max(1, ...values);
  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;
  const stepX = chart.categories.length > 1 ? chartW / (chart.categories.length - 1) : 0;

  const lines = chart.series.map((series, si) => {
    const points = series.values
      .map((value, i) => {
        const x = padding + i * stepX;
        const y = padding + (chartH - (value / max) * chartH);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `<polyline points="${points}" fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="2" />`;
  });

  const axis = `<line x1="${padding}" y1="${padding + chartH}" x2="${width - padding}" y2="${padding + chartH}" stroke="#999" />`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${axis}${lines.join("")}</svg>`;
}

function renderPieChart(chart: ResolvedChartComponent, width: number, height: number): string {
  const values = chart.series[0]?.values ?? [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 10;

  let angle = -Math.PI / 2;
  const slices = values.map((value, i) => {
    const fraction = value / total;
    const nextAngle = angle + fraction * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(nextAngle);
    const y2 = cy + r * Math.sin(nextAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    angle = nextAngle;
    return `<path d="${path}" fill="${PALETTE[i % PALETTE.length]}" />`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${slices.join("")}</svg>`;
}

export function chartTitle(chart: ResolvedChartComponent): string {
  return chart.title ? `<div style="font-weight:bold;text-align:center">${escapeHtml(chart.title)}</div>` : "";
}
