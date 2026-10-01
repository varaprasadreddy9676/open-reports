# Getting started (about 15 minutes)

You will install the platform, make a report from your own data, and render it from the API.

## 1. Install

### Option A — Docker (easiest)
Needs Docker with Compose.
```bash
git clone https://github.com/varaprasadreddy9676/open-reports.git
cd open-reports
cp .env.example .env            # optional; set API_KEYS=yoursecret to require a key
docker compose up --build
```
- Designer: <http://localhost:3000>
- API (also serves the designer): <http://localhost:4000>
- Your templates live in the `reporting-data` Docker volume.

### Option B — From source
Needs **Node 22+**, **pnpm** (`corepack enable`) and the **Noto fonts** (Debian/Ubuntu: `sudo apt-get install fonts-noto-core`; macOS: `brew install --cask font-noto-sans`).
```bash
pnpm install
pnpm doctor        # tells you exactly what is missing
pnpm build:all
pnpm start         # http://localhost:4000
```
Stuck? See [Troubleshooting](TROUBLESHOOTING.md).

## 2. Your first report from your own data
1. Open the designer → **New report → From sample JSON**.
2. Paste a response from your API, e.g.
   ```json
   { "patient": {"name": "Asha Rao", "uhid": "UH100"},
     "visit": {"date": "2025-03-01", "items": [
        {"service": "Consultation", "qty": 1, "rate": 600},
        {"service": "Blood test", "qty": 1, "rate": 450}]} }
   ```
3. Name it and **Create report**. The fields appear in the **Data** tab; a table is generated for `visit.items`.
4. Click a heading → in the right panel choose **Field** and pick `patient.name`. Click the table to rename columns or add an **Amount** column with **fx Formula → Builder** (`Qty × Rate`) and **Footer total → Sum**.
5. **Preview** shows the real PDF. Resize the window or add rows in *Data* to see pagination.
6. **Save** (stores version 1), then **Publish** when ready (published versions never change).

Tips: `Ctrl+K` opens the command palette; **Problems** (bottom) lists anything wrong and offers one-click fixes; **Pagination** explains every page break.

## 3. Render it from code
The template id is under **Report → Id** in the right panel (click an empty part of the page to see it; change it before the first Save, e.g. `visit-summary`).
```bash
curl -X POST http://localhost:4000/api/v1/templates/<id>/render \
  -H 'content-type: application/json' -H 'x-api-key: <key if you set one>' \
  -d '{"format":"pdf","data":{"patient":{"name":"Meena","uhid":"UH200"},"visit":{"date":"2025-03-02","items":[{"service":"X-ray","qty":1,"rate":700}]}}}' \
  -o out.pdf
```
`data` replaces the dataset with the same id for this render only — one template, any record. More languages and async jobs: [API guide](API.md).

## 4. Connect a real data source
- **REST API:** *Data → Add dataset → REST API*. Use `{{params.id}}` for parameters and `{{secrets.NAME}}` for tokens (value comes from `REPORT_SECRET_NAME` on the server).
- **Database:** set `REPORT_SQL_HMS=postgres://user:pass@host/db` on the server, restart, then *Data → Database (SQL)* → connection `hms` → write a parameterised query (`SELECT … WHERE id = $1`, params `["{{params.id}}"]`).
- **CSV:** *Data → CSV file* → upload.
Details and security notes: [Configuration](CONFIGURATION.md).

## 5. Where next
- Pick a recipe: [Use cases](USE_CASES.md) (receipts, labels, sticker sheets, long clinical reports, Excel exports…).
- Learn the designer: [User guide](USER_GUIDE.md).
- Put it on a server: [Deployment](DEPLOYMENT.md).
- Let AI help: [AI & MCP](AI_AND_MCP.md).
