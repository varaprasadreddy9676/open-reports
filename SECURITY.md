# Security

## Reporting a vulnerability
Please do not open a public issue. Use GitHub's private "Report a vulnerability" (Security tab) on this repository. We aim to acknowledge within 3 working days.

## Threat model and what the platform does about it
Report definitions can come from less-trusted authors (designer users, API callers, AI tools), so the engine treats a definition as **data**, never as code.

| Risk | Mitigation | Tested in |
|---|---|---|
| Code execution via formulas | Hand-written tokenizer/parser/tree-walker; no `eval`/`Function`; only registered functions (own-property lookup, so `constructor` etc. are not callable); property access blocks `__proto__`/`constructor`/`prototype`; nesting depth limit | `security.test.ts` (expression sandbox) |
| SSRF via REST datasets | URL must be http(s); loopback, private, link-local and cloud-metadata ranges blocked by default (resolved IPs, not just hostnames); host allow-list; response size cap; timeout | `datasource-rest` tests, `security.test.ts` |
| Secret leakage | API keys/tokens are never stored in reports: datasets reference `{{secrets.NAME}}`, resolved from `REPORT_SECRET_<NAME>` on the server; the designer only sees secret **names** | `datasource-rest` tests |
| SQL injection | Parameterised queries only; report parameters are bound, never concatenated; connections are registered by the host, not by reports | `datasource-sql` tests |
| Path traversal | JSON file datasources are sandboxed to an allowed root; static serving is confined to the designer directory | `security.test.ts`, `datasource-json` tests |
| Output injection | HTML renderer escapes all data and attributes; CSV prefixes cells starting with `= + - @` (formula injection); ZPL strips `^`/`~` from data | `security.test.ts` |
| Resource exhaustion | Body size limit, row limits, dataset timeouts, expression depth, label-sheet size cap, async job store with expiry | `security.test.ts`, server tests |
| Unauthenticated access | `API_KEYS` (comma-separated) required on `/api/*`; health and the public JSON Schema are open. **If `API_KEYS` is empty the server runs unauthenticated and logs a warning** — never do this on a network | `security.test.ts` |
| AI misuse / prompt injection | AI can only emit JSON Patches that are applied to a copy, validated, and (in the designer) shown as a diff for approval; MCP `--read-only` hides write tools; no model keys on the server; designer AI keys stay in the browser; inline sample data is not sent to providers | `ai-tools`, `mcp.test.ts`, designer AI tests |
| Malicious plugins | Plugins run in-process with full privileges. Only install plugins you trust. Plugin registrations are validated and rolled back on failure, and cannot replace built-in formats or functions | `plugin-sdk` tests |

## Deployment checklist
- Set `API_KEYS`; put the service behind TLS (reverse proxy).
- Run as the non-root user the Docker image provides; mount `/data` for SQLite.
- Keep REST `allowedHosts` as small as possible; do not run the server inside a network that exposes internal admin endpoints unless you list explicit hosts.
- Register SQL connections with least-privilege, read-only database users.
- Treat `REPORT_PLUGINS` entries as code you are deploying.
