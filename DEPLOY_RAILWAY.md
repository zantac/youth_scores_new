# Deploying youthscores + tla3bny on Railway

One Railway **service** (built from the repo-root `Dockerfile`) serves everything:
the Flask API plus **two** static Next.js exports, chosen by the request Host.

```
youthscores.org           →  web/out          (main youthscores app)
tla3bny.youthscores.org   →  web-tla3bny/out   (LeagueHub subdomain app)
/api/…  /uploads/…         →  shared Flask backend on both hosts
```

Host routing lives in `backend/app/__init__.py` (`_is_tla3bny_host`): any host
starting with `tla3bny.` gets the tla3bny export; everything else gets the main
export. Add extra exact hosts with the `TLA3BNY_HOSTS` env var (comma-separated)
if you ever need to.

## 1. Create the service
- New Railway project → **Deploy from GitHub repo** (this repo). Railway detects
  the `Dockerfile` automatically.
- Build args (Railway → service → *Variables* → *Build args*), set to the real
  origins the browser will call for the API (same-origin per host avoids CORS):
  - `WEB_CONFIG_URL=https://youthscores.org/api/config`
  - `TLA3BNY_CONFIG_URL=https://tla3bny.youthscores.org/api/config`

## 2. Runtime environment variables
- `SECRET_KEY` — long random string (signs both admin and tla3bny tokens).
- `ADMIN_API_KEY` — the youthscores admin master key.
- `FLASK_ENV=production`
- `DATABASE_URL` — see DB section below.
- Push notifications (only if sending for real): set **`FIREBASE_CREDENTIALS_JSON`**
  to the entire service-account JSON (paste the file's contents as the value —
  the key file itself is gitignored, so it is *not* in the image). Optionally
  `FIREBASE_PROJECT_ID` (otherwise read from the JSON). The file-path variant
  `FIREBASE_CREDENTIALS` is for local dev only.
- (`FRONTEND_DIR` / `TLA3BNY_FRONTEND_DIR` are already set in the Dockerfile.)

## 3. Database
The app is engine-agnostic (SQLAlchemy) and runs Alembic migrations on every
deploy (`flask db upgrade` in the Dockerfile `CMD`). Pick one:

- **Railway Postgres** (default managed DB): add the plugin; it injects
  `DATABASE_URL=postgresql://…`. `psycopg2-binary` is already in requirements.
  Starting fresh is easy; migrating the existing **PythonAnywhere MySQL** data
  into Postgres is a real conversion (e.g. `pgloader`) — plan for it.
- **Railway MySQL**: keeps parity with today's PythonAnywhere MySQL and the
  `utf8mb4` charset (required for Arabic). Set
  `DATABASE_URL=mysql+pymysql://USER:PASS@HOST:PORT/DB?charset=utf8mb4`.
  Data move is a straight `mysqldump` → import. **Recommended if you want to
  carry the current data over with least friction.**

Either way, seed the tla3bny league super admin once after first deploy:
`railway run flask create-tla3bny-admin --email you@example.com --password '…'`.

## 4. Uploaded images (IMPORTANT)
Two options — pick one:

**A) Object storage + CDN (recommended; cheapest on Railway).** When
`AWS_S3_BUCKET` is set, *both* apps send uploads to S3 / Cloudflare R2 / MinIO /
Backblaze B2 and store a full public URL. Files are then served from the
bucket/CDN, so image bytes never flow through the Railway container — that CPU
and egress leaves your bill entirely. Set:
  - `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - `AWS_S3_REGION` (AWS only) and/or `AWS_S3_ENDPOINT_URL` (R2/MinIO/B2)
  - `AWS_S3_PUBLIC_URL` — your CDN base, e.g. `https://cdn.youthscores.org`
    (uploads are written with a 1-year `immutable` Cache-Control, so a CDN in
    front caches them permanently).

  Cloudflare R2 + its public bucket / custom domain is a good zero-egress-fee fit.

**B) Railway Volume (local disk).** `UPLOAD_FOLDER` defaults to
`backend/instance/uploads`, which is **ephemeral** — files vanish on redeploy.
Attach a Railway **Volume**, mount it at e.g. `/data/uploads`, and set
`UPLOAD_FOLDER=/data/uploads`. Files are served through Flask's `/uploads/`
route (now with a 1-year immutable cache header), which still uses container
CPU/egress per request — put Cloudflare (or any CDN) in front of the domain so
repeat loads are cached at the edge.

### Cost notes (Railway bills CPU-seconds + RAM + egress)
- **Static site + API responses are gzipped** (Flask-Compress) and carry
  `Cache-Control`, so a CDN/browser serves repeats without hitting compute.
  Fronting the domains with Cloudflare (free tier) caches the static export and
  cacheable API reads at the edge — the single biggest lever after object storage.
- The hot public feeds (`/api/matches`, `/api/tla3bny/matches`,
  `/api/competitions/<id>/data`) are eager-loaded to avoid N+1 query storms, so
  each request costs a handful of queries instead of hundreds.

## 5. Domains & DNS
- Railway → service → *Settings* → *Networking* → **add both custom domains**:
  `youthscores.org` (and/or `www.`) **and** `tla3bny.youthscores.org`.
- At your DNS provider:
  - `tla3bny` → **CNAME** to the target Railway shows for that domain.
  - apex `youthscores.org` → Railway's apex instructions (ALIAS/ANAME, or the A
    record they provide).
- TLS certs are issued by Railway automatically once DNS resolves.

## 6. Point the clients at the new origin
- The **Flutter** app and the built web currently read config from
  `youth-scores-data.vercel.app`. After cutover, update the Flutter app's
  `CONFIG_URL` (and retire/redirect the Vercel origin) so mobile clients hit the
  Railway backend. (See the pending Flutter update.)

## Local sanity check of host routing
With both exports built (`cd web && npm run build`, `cd web-tla3bny && npm run
build`) and Flask running, the Host header selects the app:

```
curl -s -H 'Host: tla3bny.youthscores.org' localhost:5000/standings/   # tla3bny
curl -s -H 'Host: youthscores.org'          localhost:5000/competition/ # youthscores
```
