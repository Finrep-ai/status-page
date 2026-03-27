# Finrep Status Page UI

Modern static status page that reads **public Upptime data** from:

- `https://github.com/Finrep-ai/status-page`
- `history/summary.json` for service-level aggregates
- `history/<slug>.yml` for last update and latest HTTP code

No token is used in this version (Option 1), so it is safe to deploy as a client-side app on Cloudflare Pages.

## Local run

Because this app is static, any simple static server works:

```bash
npx serve .
# or
python3 -m http.server 8787
```

Open the printed URL in your browser.

## Deploy to Cloudflare Pages

### Method A: Connect GitHub repo (recommended)

1. Push this project to your GitHub repo.
2. In Cloudflare Dashboard: `Workers & Pages` -> `Create` -> `Pages` -> `Connect to Git`.
3. Select this repo.
4. Build settings:
   - Framework preset: `None`
   - Build command: *(leave empty)*
   - Build output directory: `/`
5. Deploy.

### Method B: Direct upload with Wrangler

```bash
npm i -g wrangler
wrangler pages project create finrep-status-ui
wrangler pages deploy . --project-name finrep-status-ui
```

## Data source design choice

The UI uses `history/summary.json` and `history/*.yml` instead of scraping README markdown, because these files are structured and stable for programmatic rendering.

## Future hardening note (Option 2)

If you later move to private repo access or authenticated API calls:

1. Keep GitHub token only in Cloudflare server environment (Pages Functions / Workers secret).
2. Expose a server endpoint like `/api/status` that reads GitHub and returns sanitized JSON.
3. Never expose tokens in browser JavaScript, HTML, logs, or response payloads.
4. Use fine-grained read-only credentials and rotation.

