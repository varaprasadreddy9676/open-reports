import React from "react";

const paths = {
  arrow: "M4 12h16m-6-6 6 6-6 6",
  external: "M14 4h6v6m0-6L10 14M10 4H4v16h16v-6",
  play: "m9 5 11 7-11 7Z",
  file: "M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h6",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6",
  plus: "M12 4v16M4 12h16",
  search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  check: "m5 12 4 4L19 6",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  menu: "M4 6h16M4 12h16M4 18h16",
} as const;

export function Icon({ name, className = "" }: { name: keyof typeof paths; className?: string }) {
  return <svg className={`landing-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function BrandMark() {
  return <svg className="landing-brand-mark" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="currentColor" /><path d="M10 8h14v4H10zm0 7h10v4H10zm0 7h14v4H10z" fill="var(--on-strong)" /><path d="M22 15h2v4h-2z" fill="var(--on-strong)" /></svg>;
}
