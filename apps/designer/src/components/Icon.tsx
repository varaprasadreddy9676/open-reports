import React from "react";

const P: Record<string, string> = {
  text: "M5 6h14M12 6v12M9 18h6",
  richText: "M5 6h14M12 6v12M9 18h6",
  field: "M5 6h14M12 6v12M9 18h6",
  image: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4",
  line: "M4 12h16",
  rectangle: "M5 7h14v10H5z",
  spacer: "M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4",
  container: "M4 4h16v16H4zM8 8h8v8H8z",
  row: "M4 6h16v12H4zM10 6v12M15 6v12",
  column: "M4 4h16v16H4zM4 9h16M4 14h16",
  grid: "M4 4h16v16H4zM4 12h16M12 4v16",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  repeater: "M6 6h12M6 11h12M6 16h12M3 6v0M3 11v0M3 16v0",
  qrcode: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h3v3h-6z",
  barcode: "M4 5v14M7 5v14M10 5v14M13 5v14M17 5v14M20 5v14",
  pageBreak: "M4 12h4M10 12h4M16 12h4M8 6l4-3 4 3M8 18l4 3 4-3",
  keepTogether: "M4 4h16v16H4z",
  group: "M4 4h16v6H4zM4 14h16v6H4z",
  conditional: "M12 3l9 9-9 9-9-9z",
  subreport: "M5 5h10v10H5zM9 9h10v10H9z",
  "chart-bar": "M5 19V9M10 19V5M15 19v-8M20 19V12",
  "chart-line": "M4 17l5-6 4 3 7-9",
  "chart-pie": "M12 4a8 8 0 1 0 8 8h-8zM14 3a8 8 0 0 1 7 7h-7z",
  chart: "M5 19V9M10 19V5M15 19v-8M20 19V12",
};

export function Icon({ name, small }: { name: string; small?: boolean }) {
  const d = P[name] ?? P.container!;
  const s = small ? 14 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
