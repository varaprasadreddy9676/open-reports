# Launch kit

Everything needed to put Open Reports in front of people and turn their first look into feedback. Posts are written in the maintainer's voice; replace `[DEMO_URL]` once the demo is live.

## 1. Before posting (one hour, in this order)

1. **Live demo.** Click the "Deploy to Render" button in the README (free plan). Paste the URL into the README's "Try it live" line and into the posts below. Free instances sleep when idle; the first visit takes about a minute, so mention "give it a moment to wake up".
2. **Repository settings** (Settings → General):
   - Description: `Open-source report designer: design documents in your browser and render PDF, HTML, Excel, CSV, ZPL labels and ESC/POS receipts. A self-hosted alternative to JasperReports and Crystal Reports.`
   - Website: `[DEMO_URL]`
   - Topics: `reporting` `report-designer` `pdf-generation` `jasperreports` `crystal-reports` `invoice` `label-printing` `zpl` `escpos` `self-hosted` `low-code` `typescript`
   - Social preview: upload `docs/images/social-preview.png` (Settings → General → Social preview). This is the card people see when the link is shared.
   - Features: turn on **Discussions** (the issue chooser links to it).
3. **Release.** Tag `v0.2.0` and create a GitHub release from `CHANGELOG.md`, attaching `docs/media/open-reports-launch.mp4`. Releases show up in feeds and give people something to "watch".
4. **Labels.** Create `feedback`, `good first issue` and `help wanted`. Open three or four small, well-described `good first issue`s (a starter template for a new industry is a perfect one); first-time contributors look for them.
5. **Be available.** Launch on a day you can reply to every comment for the first six hours. Replies are what make a post climb, and they turn critics into testers.

## 2. Where and when

Stagger over about a week, not one day: each channel brings different people, and you can fix the top complaint from one before the next.

| Day | Channel | Why | Timing |
|---|---|---|---|
| 1 | Hacker News (Show HN) | Developers who have suffered JasperReports and HTML-to-PDF | Tue–Thu, 8–10 am US Eastern |
| 1 | X / LinkedIn with the film | Your own network: they share it | Same morning |
| 2 | r/selfhosted | Loves self-hosted, MIT, Docker one-liners | Weekday morning US |
| 3 | r/opensource, r/node | Broad open-source and Node audiences | Weekday |
| 4 | r/webdev | Only on **Showoff Saturday** (rule) | Saturday |
| 5 | dev.to / Hashnode article | Long-tail search traffic for "JasperReports alternative" | Any |
| 7+ | Product Hunt | Wider, less technical audience; needs the live demo | Tue–Thu, 12:01 am PT |
| Ongoing | Where your users already are | Health-IT, ERP, retail/POS, logistics communities you belong to | When relevant, never cross-posted spam |

Lists to submit to once the project has some history: `awesome-selfhosted` (check their age and release requirements first), `awesome-pdf`, `awesome-nodejs`.

## 3. Posts

### Show HN

**Title:** Show HN: Open Reports – an open-source report designer that explains its page breaks

**Text:**

I build software for clinics, and every project ends up needing invoices, lab reports, labels and receipts. The options were JasperReports (a desktop Eclipse designer and XML templates), per-seat commercial tools, or HTML-to-PDF and a pile of CSS hacks the day you need repeating headers or a Zebra label.

Open Reports is my attempt at the tool I wanted:

- A browser designer with real report bands: page and group headers and footers, nested groups, keep-together, first/last/odd/even page layouts.
- A pagination engine that measures with real font metrics and tells you *why* something moved to the next page, with a one-click fix.
- One template renders to PDF, HTML, Excel, CSV, ZPL (Zebra labels) and ESC/POS (receipt printers).
- Templates are plain JSON with a published schema, so they diff in git, and an AI assistant (bring your own key, or any MCP client) edits the template as a reviewable patch rather than generating numbers.
- It imports JasperReports `.jrxml` files, whole folders at a time, as editable drafts with a list of what needs review.

It's MIT and self-hosted (one `docker compose up`). It's v0.2, well tested (about 1,000 tests in CI against real Postgres and MySQL), but young.

Demo: [DEMO_URL] (free instance, may take a moment to wake up)
Code: https://github.com/varaprasadreddy9676/open-reports

I'd love blunt feedback, especially from anyone who has fought JasperReports, Crystal or SSRS: what would stop you from switching?

### Reddit: r/selfhosted

**Title:** Open Reports: self-hosted report designer for invoices, statements, labels and receipts (MIT, one docker compose)

**Text:**

I've been building an open-source alternative to JasperReports / Crystal Reports and it's finally at a point where I'd like people to try it.

- Design reports in the browser, render PDF, HTML, Excel, CSV, Zebra labels (ZPL) and receipt-printer output (ESC/POS) from one template.
- Data from JSON, REST APIs, PostgreSQL or MySQL; credentials stay on the server.
- Runs as one container: `git clone … && docker compose up`, designer on :3000.
- No telemetry, no accounts, MIT.

64-second tour: [link to the release video or the README]
Repo: https://github.com/varaprasadreddy9676/open-reports

It's v0.2, so I'm mainly after feedback: what do you generate documents with today, and what would you need to move?

### Reddit: r/opensource and r/node

**Title:** I built an open-source report designer (PDF, Excel, labels, receipts) in TypeScript: looking for feedback

**Text:** Use the Show HN text, shortened to the bullets, the demo link and the question at the end. For r/node, add one technical paragraph: the pagination engine is a separate package that measures text with the same font metrics as the PDF renderer (PDFKit), and the designer runs the same layout code in the browser, so the canvas and the PDF agree.

### Reddit: r/webdev (Showoff Saturday only)

**Title:** [Showoff Saturday] An open-source report designer: drag data onto a page, get PDFs, Excel, labels and receipts

**Text:** Two sentences on what it is, the GIF from the README, the demo link, and one question: "What's the most annoying document you've had to generate from data?"

### X / LinkedIn

> I got tired of fighting report tools, so I built one.
>
> Open Reports: design invoices, statements, lab reports, labels and receipts in your browser. Render PDF, Excel, HTML, CSV, Zebra labels and receipt printers from one template.
>
> Open source (MIT), self-hosted, no per-seat fees.
>
> 64-second tour ↓ [attach docs/media/open-reports-launch.mp4]
> Try it: [DEMO_URL]
> Code: github.com/varaprasadreddy9676/open-reports
>
> Tell me what breaks.

On LinkedIn, add one line on who it helps (clinics, retail, logistics, finance teams) and tag two or three people you know who generate documents for a living.

### Product Hunt

- **Name:** Open Reports
- **Tagline (60 chars):** Design documents in your browser. Render them anywhere.
- **Description (260 chars):** Open-source report designer for invoices, statements, labels and receipts. Real page-break control, explained. One template renders PDF, HTML, Excel, CSV, ZPL labels and ESC/POS receipts. Self-hosted, MIT, bring-your-own-AI.
- **Topics:** Developer Tools, Open Source, Productivity, SaaS alternatives
- **Media:** the film, `docs/images/social-preview.png`, and the README screenshots (designer, table conditions, pagination, preview, labels).
- **Maker's first comment:** the Show HN text, plus "Free and MIT: if your team pays per seat for report tooling today, I'd love to hear what would make you switch."

### dev.to / Hashnode article

Title: *"Why does my PDF have one lonely row on the last page? Building a report engine that explains itself"*

Outline: the classic report-engine pains (orphaned rows, headers that don't repeat, mysterious breaks) → how Open Reports measures with real font metrics and records every page-break decision → a short walkthrough (JSON sample → report → PDF and a Zebra label) → what's next and how to give feedback. End with the demo and repo links.

## 4. Turning attention into feedback

- The app's **More → Send feedback** and the README link both open the "I tried Open Reports" form (`.github/ISSUE_TEMPLATE/1-feedback.yml`): how they tried it, what they built, where they got stuck, what they use today, would they switch.
- Reply to every piece of feedback within a day, label it `feedback`, and close the loop publicly ("fixed in v0.2.1, thanks @…"). People share projects where they were listened to.
- Each week, read all `feedback` issues and fix the single most common blocker before the next post.
- Ask the happiest users for one sentence you can quote, and for a star; stars are the social proof the next visitor looks at.

## 5. What to measure

Stars, demo visits (Render dashboard), clones and visitors (repo Insights → Traffic), number of `feedback` issues, and how many of them say "Probably" or "Yes" to real use. A launch went well if you have about 20 pieces of written feedback, not if it trended for a day.
