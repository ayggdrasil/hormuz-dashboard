# Hormuz Dashboard

Iran / Middle East / Oil monitoring dashboard with split-screen layout:

- Left: Polymarket related markets (list + detailed view + price history)
- Right: Intel feed (Google News RSS + oil snapshot) with map, classification filters, list, and detail view

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy on Vercel

### 1) Push to GitHub

```bash
git add .
git commit -m "chore: prepare vercel deployment"
git push
```

### 2) Import project in Vercel dashboard

- Framework preset: `Next.js` (auto-detected)
- Root directory: repository root (`81_hormuz_dashboard`)
- Build command: `npm run build`
- Install command: `npm install`

### 3) Environment variables

- Required: none
- Optional: none for current implementation

### 4) Deploy

- Click `Deploy` in Vercel dashboard
- Or use CLI:

```bash
npm run vercel:deploy
```

## Notes for production

- `/api/intel` polls external feeds and includes a short in-memory cache (about 55 seconds per instance).
- Frontend requests incremental intel updates every 60 seconds.
- Public endpoints can have temporary rate limits or outages; behavior falls back gracefully where possible.

## API routes

- `GET /api/markets?limit=120`
- `GET /api/markets/:id`
- `GET /api/intel?limit=180&categories=attack,casualties`
- `POST /api/translate` (Google translate passthrough for on-screen UI translation)

## Data sources

- Polymarket Gamma API (`gamma-api.polymarket.com`)
- Polymarket CLOB history API (`clob.polymarket.com`)
- Google News RSS search feeds
- Google Translate web endpoint (`translate.googleapis.com`)
- Stooq quote feed (`CL.F`) for oil snapshot
