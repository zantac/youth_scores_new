# Plan: Entity path-route conversion (`/match/5`) for SEO + share cards

Status: **researched + spike-validated**, ready to execute.
Owner context: youthscores (Egyptian youth football). Web = Next.js 15 App Router,
`output: 'export'`, served by the Flask backend (not a dumb CDN). Canonical host
`www.youthscores.org`.

---

## 1. Goal

Move entity pages from query-param URLs (`/match?id=5`) to clean path routes
(`/match/5`) to unlock:

- **SEO indexing** — distinct, crawlable, sitemap-able per-entity URLs (today
  every entity is one client-rendered `?id=` shell → nothing indexes per item).
- **Fresh share cards** — must *preserve* the per-item OG previews the backend
  already injects (do not regress freshness).

## 2. The constraint that dictates the design

`output: 'export'` serves a path only if a **file exists** at build time
(`_serve_frontend` → `os.path.isfile(path/index.html)`,
`backend/app/__init__.py:745,756`). Enumerability reality:

| Entity | Volume | Enumeration endpoint | Prebuild all? |
|---|---|---|---|
| competition | dozens–hundreds | `/api/data` (uncapped) | ✅ |
| club | hundreds | `/api/clubs` (uncapped) | ✅ |
| news | hundreds | `/api/config` bundle | ✅ |
| **match** | thousands–tens of thousands, daily churn | `/api/matches` **capped 2000** | ❌ (+ stale on new result) |
| **player** | tens of thousands | **none** | ❌ |
| team / coach | hundreds–thousands | **none** | ❌ |

**Key asset:** the Flask backend already injects **live, request-time** OG/title
metadata for every `?id=` page (`_serve_frontend` share block,
`backend/app/__init__.py:763-789`; `_inject_share_meta` at `:196`;
`Cache-Control: max-age=0, must-revalidate` at `:788`). It is `<meta>`-only
(body not touched) and always fresh from the DB. Because Flask serves the export,
high-cardinality entities do **not** need prebuilt files — Flask serves a shell +
injects fresh metadata.

## 3. Spike results (the linchpin — validated in a real browser)

A throwaway `/spike/[id]` route was built with `output: 'export'` and served by a
Flask-mimicking fallback server (unknown `/spike/<id>` → a sentinel
`spike/shell/index.html`). Loaded in Chromium (playwright):

```
/spike/1/   (prebuilt)      → build:1     | useParams:1     | location:1
/spike/777/ (sentinel shell) → build:shell | useParams:shell | location:777
```

Findings:
1. ✅ Export emits files **only** for enumerated `generateStaticParams`; a sentinel
   shell file is serveable for the long tail.
2. ✅ `generateMetadata` **bakes per-id `<title>`** into each prebuilt page →
   Tier-A SSG metadata works.
3. ❌ **`useParams()` returns the BAKED route param on a hard-loaded shell**, not
   the live URL. The naive "serve one shell + read `useParams()`" would fetch the
   **wrong entity** for every long-tail id.
4. ✅ **`window.location.pathname` recovers the true id** (`location:777`). This is
   the correct Tier-B id source.

**Plan correction from the spike:** Tier-B pages must derive the id from
`window.location.pathname`, **never** `useParams()`.

## 4. Architecture — two tiers

**Tier A — prebuild (competition, club, news):**
`[id]` route + `generateStaticParams` (enumerate via `fetchClubs`/`fetchConfig`) +
`generateMetadata` → real static HTML with baked metadata, listed in the sitemap.
Strongest SEO. Rebuild each deploy picks up new ones. `useParams()` is fine here.

**Tier B — Flask-served shell (match, player, team, coach):**
- Next `[id]` route whose `generateStaticParams` emits a single **sentinel shell**
  (a generic client loading shell — no per-id server content).
- Client derives the id from `window.location.pathname` and fetches the entity.
- **Flask** serves that sentinel shell for any `/match/<id>` and **injects fresh
  OG/title** (extend the existing `?id=` share block to parse the trailing path
  segment). No build-time enumeration; always fresh.

Both tiers keep `[id]` dynamic routes so **client-side SPA navigation stays
instant** for any id (the JS route bundle handles it); Flask only serves
hard-hits/crawlers for Tier B.

## 5. Concrete changes

### Web (`web/`)
1. **Central link helper first** — `hrefFor(entity, id, opts)` in `src/lib/`.
   There is no helper today; links are ~20–25 inline template literals (public) +
   ~8 admin, e.g. `competition/page.tsx:1070`, `components/home/MatchesFeed.tsx:248`,
   `player/page.tsx:210`, `SearchOverlay.tsx:64,72,82`. Introduce the helper, then
   replace all sites (grep gate: no remaining `/{entity}?id=` literals).
2. **Add `[id]` routes**; move id-read from `useSearchParams().get('id')`:
   - Tier A → `useParams()`; add `generateStaticParams` + `generateMetadata`.
   - Tier B → **`window.location.pathname`** (per spike); sentinel
     `generateStaticParams`; no per-id server content.
   Keep sub-state as query params: player `tab` (`player/page.tsx:73`), competition
   `tab/team/stat/teamtab/week`.
3. **Competition is the long pole** (`competition/page.tsx:1315`): identity →
   `/competition/[id]`, keep `tab/team/stat/teamtab/week` as query, and keep the
   legacy `?url=&title=` form working (`:1288,1316-1319`).
4. **Match ShareSheet needs no change** — shares `window.location.href`
   (`match/page.tsx:273`), auto-adopts `/match/5/`.
5. **Sitemap** (`src/app/sitemap.ts`): enumerate Tier-A URLs (competitions, clubs,
   news) + recent matches. Use canonical `https://www.youthscores.org`.
6. Keep `trailingSlash: true` → routes export to `/match/5/index.html`.

### Backend (Flask — the enabler; localized)
7. In the `_serve_frontend` share block (`backend/app/__init__.py:772-778`), split a
   trailing numeric segment: `/match/5` → page=`match`, id=`5`, then call the
   **existing** `_*_share_page` builders. Thread an explicit `item_id` through the 7
   builders (`_match_share_page` `:172`, competition/news/club/team/player/coach);
   the `_*_share_meta` helpers already take an int id, so no change there.
8. **Serve the Tier-B sentinel shell** for `/match/<id>` (map the path to the
   entity's shell `index.html`). Spike-confirmed the client then reads the real id
   from `window.location.pathname`.
9. **Back-compat 301:** in Flask, redirect `/match?id=5` → `/match/5/` so old shared
   links, notification payloads, and old app deep-links keep working and consolidate
   SEO signal.
10. *(Optional, later)* inject a minimal **server-rendered body block** (team names /
    score / date) into the shell for stronger crawler content — today injection is
    `<meta>`-only (`_inject_share_meta`, `:196`).

### Flutter (`lib/`) — low risk, one choke point
11. **Ship FIRST** — `notification_service.dart:188`, source the id from the path
    when the query is absent (accepts BOTH forms):
    ```dart
    final id = uri.queryParameters['id'] ??
        (uri.pathSegments.length > 1 ? uri.pathSegments[1] : null);
    ```
    The app builds **zero** `?id=` URLs, so nothing else changes. Entity type
    already comes from `pathSegments.first`.
12. Android App Link `pathPrefix` already captures `/match/5` (prefix match,
    `android/app/src/main/AndroidManifest.xml:45-55`) — no manifest change needed for
    capture. (Optional: add `/match` prefix + a real match route — a pre-existing gap;
    `match` currently mis-routes to a competition screen.) iOS has no universal links
    (not a concern). `assetlinks.json` is host-only (no change).
13. **FCM payloads:** keep emitting `?id=` (`backend/app/services/notifications.py`
    `:275,329,384,...`) until the path-aware app build has high adoption (gate via the
    `app_versions` table), then switch. The Flask 301 (#9) covers the interim.

## 6. Sequencing (avoids version-skew breakage)

1. **App first** — ship the `_route` one-liner (#11); let adoption build via the
   update gate. Now the app understands both URL forms.
2. **Backend** — Flask trailing-id parsing + sentinel-shell serving (#7–8) + the
   `?id=`→path 301 (#9). Both forms now work everywhere.
3. **Web** — `hrefFor` helper (#1) → `[id]` routes (#2–3) → sitemap (#5). Old `?id=`
   still 301s, so nothing breaks mid-migration.
4. **Later** — Tier-A metadata polish + optional body-content injection (#10) +
   switch FCM payloads to path form.

## 7. Risks & mitigations

- Static export can't prebuild high-cardinality ids → Flask serves the sentinel
  shell (Tier B). *By design.*
- **`useParams()` is baked on hard-load** → read `window.location.pathname`
  (spike-verified). *Corrected.*
- App version skew (old app + new URLs → dead taps; App Link still captures, so no
  browser fallback) → ship app fix first; keep `?id=` alive via the 301. *Sequencing.*
- Missed link site among ~20–25 inline literals → `hrefFor` helper + grep gate.
- Competition dual-identity / legacy `?url=` → handled explicitly, kept working.

## 8. Effort

- Flutter one-liner: **S** (~1 hr incl. test).
- Flask trailing-id + sentinel serving + 301: **S–M** (~half day).
- Web helper + route conversion + sitemap: **M–L** (~2–3 days; competition is the
  long pole).
- Tier-A metadata + optional body injection: **M** (follow-up).

## 9. Open items

- Decide the exact sentinel-shell file layout per Tier-B entity and the Flask
  path→shell map (spike used one sentinel; production may share one loading shell
  across all Tier-B entities or one per entity).
- Confirm `usePathname()` vs raw `window.location.pathname` for reactive re-fetch on
  SPA nav between two non-prebuilt ids (spike used `window.location` in `useEffect`,
  which is correct for hard-load; verify the reactive case during impl).

---

*Basis: parallel code investigation (backend OG mechanism, web link blast radius,
Flutter deep-link coupling) + a browser-verified export-shell spike, 2026-08-31.*
