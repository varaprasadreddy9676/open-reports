// Addresses of the film stack. Override with environment variables when running elsewhere.
export const STACK = {
  filmId: "open-reports-flagship",
  designer: process.env.FILM_DESIGNER_URL || "http://localhost:4200",
  engine: process.env.FILM_ENGINE_URL || "http://127.0.0.1:4200",
  caredesk: process.env.FILM_CAREDESK_URL || "http://localhost:3002",
  ledgerline: process.env.FILM_LEDGERLINE_URL || "http://localhost:3003",
  caredeskReports: process.env.CAREDESK_REPORT_DIR || "/tmp/caredesk/reports",
  downloads: process.env.FILM_DOWNLOADS || "/tmp/open-reports-film/Downloads",
  work: process.env.FILM_WORK || "/tmp/open-reports-film/work",
  out: process.env.FILM_OUT || new URL("../../apps/designer/public/demo-videos", import.meta.url).pathname,
  get health() {
    return { "Open Reports": `${this.engine}/health`, CareDesk: `${this.caredesk}/app-api/config`, Ledgerline: `${this.ledgerline}/app-api/config` };
  },
};
