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
  structure: "M5 4h14v4H5zM7 12h12v4H7zM9 20h10v1H9z",
  data: "M4 6c0-3 16-3 16 0v12c0 3-16 3-16 0zM4 6c0 3 16 3 16 0M4 12c0 3 16 3 16 0",
  components: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  pages: "M6 3h10l3 3v15H6zM16 3v4h3M9 11h7M9 15h7",
  conditional: "M12 3l9 9-9 9-9-9z",
  lock: "M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3M12 15v2",
  unlock: "M5 11h14v10H5zM8 11V8a4 4 0 0 1 7-2M12 15v2",
  hidden: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M7.1 7.1A12 12 0 0 0 2 12s3.6 7 10 7c1.5 0 2.9-.4 4.1-1.1M9.9 5.2A12 12 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-2.7 3.4",
  subreport: "M5 5h10v10H5zM9 9h10v10H9z",
  "chart-bar": "M5 19V9M10 19V5M15 19v-8M20 19V12",
  "chart-line": "M4 17l5-6 4 3 7-9",
  "chart-pie": "M12 4a8 8 0 1 0 8 8h-8zM14 3a8 8 0 0 1 7 7h-7z",
  labelSheet: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
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
