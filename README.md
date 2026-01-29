# FB Auto Poster (Local Dashboard + Userscript)

This project provides a **local, mobile-first React dashboard** and a **Tampermonkey userscript** that automates Facebook posting in a real browser session. It is built to run without a backend; all state is stored in `localStorage`.

## Project Structure

```
app/           # Vite + React dashboard
shared/        # Shared schema, CSV, similarity, cron logic
userscript/    # Tampermonkey userscript source + build output
tests/         # Vitest tests for shared logic
```

## Prerequisites

- Node.js 18+
- A Tampermonkey-compatible browser (iOS Safari via Userscripts app or desktop Safari/Chrome)

## Local Development

```bash
npm install
npm run dev
```

The dashboard runs at `http://localhost:5173`.

## Build (Static Hosting)

```bash
npm run build
```

The production build is emitted to `dist/` and can be hosted on any static host.

### Render (Static Site)

A `render.yaml` file is included for Render free tier deployment. Connect your repo and deploy the static site. Render will run:

```bash
npm install
npm run build
```

## Userscript Build

```bash
npm run build:userscript
```

Import `userscript/dist/fb-auto-poster.user.js` into Tampermonkey. On first run, the script will prompt for the dashboard URL and inject the dashboard overlay on Facebook.

## Usage Workflow

1. Deploy the dashboard (or run locally) and keep the URL handy.
2. Install the userscript and open Facebook.
3. When prompted, enter the dashboard URL. The dashboard iframe will appear as an overlay.
4. Add accounts, create posts, or upload CSV batches from the dashboard.
5. The dashboard sends jobs to the userscript via `postMessage` with BroadcastChannel and localStorage fallbacks.

> **Note:** Scheduling requires the dashboard tab to remain open. Without a backend, cron triggers are evaluated client-side.

## Testing

```bash
npm test
```

This runs the Vitest suite for CSV parsing, similarity logic, and schema validation.

## Security & Safety Notes

- Credentials and cookies are stored only in your browser `localStorage`.
- Proxies are stored for reference and logged but cannot be enforced inside the browser without external tooling.
- If Facebook triggers 2FA or security checks, complete them manually and retry the job.

## CSV Format

Use the included `batch-sample.csv` file as a template:

```
target,text,file_url,schedule_time
https://www.facebook.com/groups/1234567890,Hello group!,https://example.com/sample.jpg,2026-01-27T14:00:00Z
profile,Hello profile,,
```

## Deployment Targets

- **Local static hosting**: `npm run dev` or `npm run preview`
- **Render**: use `render.yaml`

