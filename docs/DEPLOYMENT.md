# Deployment

## Quick reference
| | |
|---|---|
| Image | build from the repo `Dockerfile` (`target: api`) — includes fonts, the API, the designer and the examples |
| Port | `4000` (API **and** designer). Compose also starts an nginx designer on `3000` that proxies `/api` |
| State | one SQLite file at `/data/reporting.sqlite` → mount a volume on `/data` |
| Health | `GET /health` → `{"status":"ok"}` (the image has a `HEALTHCHECK`) |
| User | runs as non-root (uid 10001) |

## Docker Compose (single host)
```bash
cp .env.example .env     # set API_KEYS, REPORT_SQL_*, REPORT_SECRET_* ...
docker compose up -d --build
```
Edit `docker-compose.yml` to pass more variables through. Data persists in the `reporting-data` volume.

## Plain Docker
```bash
docker build --target api -t open-reports .
docker run -d --name reports -p 4000:4000 -v reports-data:/data \
  -e API_KEYS=change-me -e REPORT_SQL_HMS=postgres://ro:pw@db:5432/hms open-reports
```

## Before you expose it
1. **Set `API_KEYS`.** Use long random values; rotate by listing old+new, then dropping old.
2. **Terminate TLS** in front (Caddy, nginx, Traefik, a cloud load balancer). Example Caddy: `reports.example.com { reverse_proxy localhost:4000 }`
3. **Keys stay server-side.** Your backend calls the API; never ship the key to a browser. For staff using the designer, put the whole app behind your SSO/VPN or reverse-proxy auth.
4. Give database connections **read-only** users; set `REPORT_REST_ALLOWED_HOSTS` to exactly the APIs you need.
5. Only load plugins you trust (they run in-process).
See [SECURITY.md](../SECURITY.md).

## Backups and upgrades
- **Backup:** copy `/data/reporting.sqlite` (use `sqlite3 reporting.sqlite ".backup out.sqlite"` while running). Templates are also just JSON — export from the designer (*Export → Report definition*) or via the API into git.
- **Upgrade:** `git pull && docker compose up -d --build`. Published template versions are immutable and the schema is versioned (`schemaVersion`); read the [CHANGELOG](../CHANGELOG.md) for migrations.

## Sizing
A single container renders typical documents in tens of milliseconds to a second (a 2 000-row PDF ≈ 0.8 s; 100 000-row XLSX ≈ 8 s on a laptop-class CPU; run `pnpm --filter @reporting/server bench`). Rendering is CPU-bound and single-process: for more throughput run several replicas behind a load balancer. SQLite is a single file — for multi-replica deployments mount shared storage cautiously or provide a storage [plugin](PLUGIN_DEVELOPMENT.md) (e.g. PostgreSQL). Use async jobs (`/api/v1/render/jobs`) for big exports so HTTP timeouts don't bite.

## Kubernetes sketch
One Deployment (1+ replicas), a Service on 4000, liveness/readiness on `/health`, secrets as env from a `Secret`, a PVC on `/data` (single replica with SQLite).

## Without Docker
`pnpm install && pnpm doctor && pnpm build:all` then run `node scripts/start.mjs` under systemd/pm2 with the environment above. Install fonts (`fonts-noto-core`) on the host.
