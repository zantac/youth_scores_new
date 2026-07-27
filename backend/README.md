# Youthscores backend

Flask + SQLAlchemy API and admin panel for the Egyptian youth competition system.
Schema follows `../readme.txt`, with the deviations listed below.

## Local setup

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -r requirements.txt
cp .env.example .env
flask db upgrade              # builds the schema on SQLite
```

`FLASK_APP=wsgi.py` is needed for the `flask` commands.

`flask db upgrade` builds the **whole** schema from empty — every table, both
the youthscores ones and the 23 `tla3bny_*` ones. The database itself is not in
git (`instance/`, `*.db` are ignored), so a fresh clone starts with no data.
Import the legacy feed (see *Importing the legacy JSON* below) if you want
something to look at.

### The two frontends

Each is its own Next app and needs its dependencies installed and a
`.env.local` pointing at your Flask port:

```bash
cd web           && npm install && cp .env.local.example .env.local && npm run dev
cd web-tla3bny   && npm install && cp .env.local.example .env.local && npm run dev
```

`web/` is youthscores (www.youthscores.org); `web-tla3bny/` is the league app
(tla3bny.youthscores.org). In production Flask serves both from their own host
and `NEXT_PUBLIC_CONFIG_URL` is left unset, so the clients call the API on the
same origin — the env file exists only because the dev servers run on a
different port from Flask. Note that `next dev` silently moves to the next free
port if 3000 is taken, and the app calls whatever port the env file names, so
run Flask on the port the browser is actually asking for.

### The tla3bny super admin

There is no seeded account — create one:

```bash
flask create-tla3bny-admin --username admin --password <pw>
```

Academies sign themselves up (no approval needed); this account is for running
seasons, ages and competitions, and for assigning competition organisers.

## PythonAnywhere

Create the MySQL database from the **Databases** tab, then confirm its charset —
**Arabic text silently corrupts on `latin1` or `utf8`**, and the tables inherit
whatever the database defaults to:

```sql
ALTER DATABASE `USER$youthscores`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Set `DATABASE_URL` (see `.env.example`, keep `?charset=utf8mb4`) and run
`flask db upgrade`. The custom domain **youthscores.org** requires a paid plan;
free accounts only get `*.pythonanywhere.com`.

## Schema notes

24 tables: the design doc's 18, plus six the app needs.

### Added beyond the design doc

| Addition | Why |
|---|---|
| `venues`, `news`, `ads`, `app_versions` | The current JSON feed serves all four and each has a screen in the apps. The doc covers none of them. |
| `group_teams` | The doc links groups to matches only, so a team that has not played yet could not appear in its own standings table, and a team progressing to a later stage had nowhere to record its second group. |
| `competition_teams` | The competition roster. 11 of 28 imported competitions run without groups, so group membership cannot stand in for "who is entered". |
| `competitions.code` + `sector_*` | The feed nests competition → age → sector; each sector is its own competition instance, tied to its siblings by `code`. |
| `admin_users` | The doc never says who may enter data. |
| `teams.point_deduction` | Feeds the points column in the standings; the feed carries it. |
| `matches.week` | The fixtures list groups by matchday. |
| `matches.note_en/ar` | Present in the feed. |
| `players.birth_year_verified` | See below. |

### Changed from the design doc

- **`matches.status`** is `scheduled/live/completed/postponed/cancelled`, not
  `scheduled/played/postponed`. `completed` is what the feed and both clients
  already use, and `live` is needed for in-progress scores.
- **`minute` is nullable** on goals, cards and substitutions. The doc has it NOT
  NULL, but the JSON being migrated records only scorer names and counts — never
  minutes — so every historical row would fail the constraint.
- **`players.birth_year`** stays NOT NULL, but migrated players have no birth
  year in the source. It is inferred from the age group of the team they played
  for and flagged `birth_year_verified = FALSE`. That guess is wrong for anyone
  playing up, which is exactly what the flag is for:
  ```sql
  SELECT * FROM players WHERE birth_year_verified = 0;
  ```
- Tables are **plural** (`matches`, `competition_groups`). `MATCH` and `GROUP`
  are reserved words in MySQL.
- **`Team` is no longer unique on `(club, age_group, season)`.** A club can enter
  the same competition twice for separate phases, and the two must stay separate
  or the standings double-count. Identity moved to `Team.source_ref`.

### Standings

Computed in Python (`app/services/standings.py`), replacing the identical Dart
and TypeScript copies. Rules: completed non-knockout matches only, 3/1/0 points
starting from `-point_deduction`, sorted by points, ties broken within each
level.

The tiebreak is a real competition rule, kept verbatim: head-to-head is used
**only when every tied pair has played exactly twice**, otherwise it falls back
to overall goal difference then goals scored. Pinned down in
`tests/test_standings.py`.

Verified by running the shipping `web/src/lib/utils.ts` (unmodified — Node 24
strips the types) against this Python over all 4,459 imported matches: **48 of 48
group tables identical** in order, points and goal difference.

A team is **one competition entry, not one club.** A club that re-enters a
competition for a second phase is two feed entries with their own tables and
points; merging them by name piled both phases onto one row and inflated the
standings. `Team.source_ref` keeps them apart; they share a `Club`. This is why
there are 470 teams for 178 clubs.

### Rules encoded in the schema

- **Age eligibility** — `age_groups.oldest_birth_year` is the earliest birth year
  allowed. `player.birth_year >= oldest_birth_year`, so younger players may play
  up but older players can never play down. `AgeGroup.allows()` in
  `app/models/core.py`.
- **One club, every age group** — one `clubs` row, one `teams` row per age group
  per season, unique on `(club_id, age_group_id, season_id)`.
- **Transfers** — `player_teams` rows with `end_date = NULL` meaning current.
  A mid-season move closes the old row and opens a new one.
- **Goals follow the club, not the player** — `match_goals.team_id` records who
  the goal was scored *for*, so a transferred player's goals stay with the old
  club while his profile follows him. Own goals set `team_id` to the benefiting
  team and `scorer_id` to the player who scored it, so top-scorer queries must
  exclude `is_own_goal`.

## Importing the legacy JSON

```bash
python -m scripts.migrate_json           # re-runnable; adds nothing on a second run
python -m scripts.migrate_json --reset   # wipe the season and re-import
python -m scripts.migrate_json --report  # describe the imported data
```

Imports the **2025-2026** season only. The feed also carries a 2026-2027 season
(c007–c011, teams but almost no matches yet); pass `--season 2026-2027` for it.

Current result: 4,459 matches, 178 clubs, 440 teams, 3,414 players, 7,013 goals —
reconciled against the source feed exactly.

### How the feed maps onto the schema

The feed nests **competition → age → sector**, where a sector (Cairo / Delta /
Upper Egypt) has its own teams, matches and table. Each sector is therefore its
own `competitions` row, tied back to its siblings by `code`.

Two different things are both called "group" in the feed:

| Feed field | Meaning | Maps to |
|---|---|---|
| `team.group` | The team's group — `الاوائل`, `2A` | `competition_groups` + `group_teams`; what standings group by |
| `match.group` | A phase label — `المرحلة الاولي` | `matches.round_label_ar`, and `group_id` too when it names a real group |

Club identity is the **name**: `team_id` is file-local, so `t001` is a different
club in every feed. Names are normalised for أ/إ/آ and Arabic-Indic digits before
matching, which correctly merges spellings like `إنبي` / `انبي`.

### What the source data cannot tell us

- **Only 50% of goals have a named scorer.** 1,680 completed matches record goals
  but no scorers. Standings are unaffected; top-scorer tables are incomplete.
- **No birth years at all.** Every imported player has an inferred one and
  `birth_year_verified = 0`. All 3,414 need review.
- **No goal minutes**, so `minute` is NULL on every imported goal.
- **No player identity.** A name is only unique within a team, so the same person
  at two clubs becomes two rows (462 names are shared across rows). Splitting is
  the recoverable error; merging without identity data is not.
- **Cards are effectively absent** — 2 in the whole feed.
- `"لا يوجد بيانات"` ("no data available") is written into scorer lists as if it
  were a name. It is filtered out; imported literally it was the leading scorer
  of the season with 63 goals.

### Source problems worth fixing upstream

The import warns about these rather than hiding them:

- **`match_id` is not unique within a file.** `m028` in c003/2009 names three
  different fixtures. The import keys on feed position instead, so nothing is
  lost — but anything looking a match up by id (including the current apps) will
  find the wrong one.
- **10 matches contradict themselves**, listing more scorers than the scoreline
  allows (e.g. c002/2009 `m098`: six scorers, `home_score` 0).
- **`home_squade`** is misspelled in 4,454 matches; `home_squad` in 105.

## Push notifications

When news or a venue is published, the backend broadcasts a push notification.
It uses **Firebase Cloud Messaging topics**: both clients subscribe to a topic
and the backend sends one message per event — no device tokens are stored.

### Dry-run (default)

With `FIREBASE_CREDENTIALS` unset, notifications run in **dry-run**: the exact
payload is logged and nothing is sent. So the pipeline works today —

```bash
curl -X POST http://localhost:5001/api/admin/news \
  -H "Content-Type: application/json" -H "X-Admin-Key: dev-admin-key" \
  --data '{"title_ar":"عنوان الخبر","details_ar":"..."}'
# -> logs: [notifications:dry-run] topic=news title='عنوان الخبر' ...
```

### Endpoints

| Method | Path | Auth | Effect |
|---|---|---|---|
| POST | `/api/admin/news` | `X-Admin-Key` | Create a news item; notify topic `news` (unless it's a draft) |
| POST | `/api/admin/venues` | `X-Admin-Key` | Create a venue; notify topic `venues` |
| POST | `/api/push/subscribe` | public | Web client posts its FCM token to join the topics |

`app/services/notifications.py` holds `notify_new_news()` / `notify_new_venue()`
— the same helpers a future admin panel calls, so the trigger lives in one place.
The JSON migration does **not** call them, so importing history stays silent.

### Going live

1. Create a Firebase project and enable Cloud Messaging.
2. Download a **service-account JSON** (Project settings → Service accounts) and
   point `FIREBASE_CREDENTIALS` at it. Real sending turns on automatically.
3. **Android app** (Flutter): add `firebase_core` + `firebase_messaging` and the
   `google-services.json`, then on startup
   `FirebaseMessaging.instance.subscribeToTopic('news')` and `'venues'`. Requires
   rebuilding and re-publishing the app.
4. **Web** (PWA): add the Firebase JS SDK + a `firebase-messaging-sw.js` service
   worker and a **VAPID** web-push key; request permission, get the token, and
   POST it to `/api/push/subscribe` (web has no client-side topic API, so the
   server subscribes the token via the Instance ID API).

Until steps 1–2 are done everything stays in dry-run; no client or server code
changes are needed to flip it on.

## Layout

```
app/
  __init__.py      app factory
  config.py        env-driven config
  extensions.py    db, migrate, constraint naming convention
  models/
    base.py        TimestampMixin, code_enum, bilingual fallback
    codes.py       controlled vocabularies for coded columns
    core.py        Club, Season, AgeGroup, Player, Coach
    team.py        Team, TeamCoach, PlayerTeam, ClubStaff
    competition.py Competition, Stage, Group, GroupTeam
    match.py       Match + events (goals, cards, subs, shootout)
    content.py     Venue, News, Ad, AppVersion
    auth.py        AdminUser
migrations/        Alembic
```
