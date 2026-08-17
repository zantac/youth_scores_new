import type { ConfigData, CompetitionData, Match, MatchSub, Team, Players, AgeGroup, Sector, Competition, Season, Localized, HomeMatch } from './types';

// Default to a same-origin (relative) API: the Flask backend serves this site,
// so /api/... resolves to whatever host the browser is on (Railway temp domain,
// youthscores.org, etc.). Set NEXT_PUBLIC_CONFIG_URL only to point at a
// different origin.
const CONFIG_URL = process.env.NEXT_PUBLIC_CONFIG_URL ?? '/api/config';

// The aggregate match feed lives on the same backend as the config endpoint.
// Empty string when CONFIG_URL is relative → fetches stay same-origin.
const API_ORIGIN = CONFIG_URL.replace(/\/api\/config\/?$/, '');

/** Absolute (dev) or same-origin (prod) URL of a competition's data blob — the
 *  `url` the /competition page fetches. Built from API_ORIGIN, NOT the browser
 *  origin, so it hits the backend even when the app is served from another port. */
export const competitionDataUrl = (id: number | string) =>
  `${API_ORIGIN}/api/competitions/${id}/data`;

// ── First-party ad analytics (fire-and-forget) ───────────────────────────────
export const apiAdImpression = (id: number, placement?: string) => adEvent(id, 'impression', placement);
export const apiAdClick      = (id: number, placement?: string) => adEvent(id, 'click', placement);

async function adEvent(id: number, kind: 'impression' | 'click', placement?: string) {
  if (!id) return;
  try {
    await fetch(`${API_ORIGIN}/api/ads/${id}/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'web', ...(placement ? { placement } : {}) }),
      keepalive: true, // survive the navigation a click triggers
    });
  } catch { /* analytics must never disrupt the user */ }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseLocalized(raw: unknown): string | Localized | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, string>;
    return { ar: obj.ar ?? '', en: obj.en ?? '' };
  }
  if (typeof raw === 'string' && raw) return raw;
  return undefined;
}

function parseList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(e => String(e ?? '')).filter(Boolean);
  if (typeof raw === 'string' && raw) return [raw];
  return [];
}

/** Substitutions as structured rows. Absent from older data, which only carries
 *  the `home_sub`/`away_sub` strings; an empty list falls back to those. */
function parseSubs(raw: unknown): MatchSub[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(e => {
    if (!e || typeof e !== 'object') return [];
    const o = e as Record<string, unknown>;
    const into = String(o.in ?? ''), out = String(o.out ?? '');
    if (!into && !out) return [];
    return [{
      side: o.side === 'away' ? 'away' as const : 'home' as const,
      in: into, out,
      minute: typeof o.minute === 'number' ? o.minute : null,
    }];
  });
}

function parseInt2(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (v == null) return undefined;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? undefined : n;
}

function parseMatch(j: Record<string, unknown>): Match {
  return {
    id:          String(j.match_id ?? ''),
    group:       String(j.group ?? ''),
    week:        String(j.week ?? ''),
    date:        String(j.date ?? ''),
    time:        String(j.time ?? ''),
    homeTeamId:  String(j.home_team_id ?? ''),
    awayTeamId:  String(j.away_team_id ?? ''),
    venue:       String(j.venue ?? ''),
    status:      String(j.status ?? ''),
    note:        j.note ? String(j.note) : undefined,
    homeScore:   parseInt2(j.home_score),
    awayScore:   parseInt2(j.away_score),
    homeScorers: parseList(j.home_scorers),
    awayScorers: parseList(j.away_scorers),
    homePenalty: parseInt2(j.home_penalty),
    awayPenalty: parseInt2(j.away_penalty),
    homeYc:      parseList(j.home_yc),
    awayYc:      parseList(j.away_yc),
    homeRc:      parseList(j.home_rc),
    awayRc:      parseList(j.away_rc),
    homeSub:     parseList(j.home_sub),
    awaySub:     parseList(j.away_sub),
    subs:        parseSubs(j.subs),
    homeSquad:   parseList(j.home_squade),
    awaySquad:   parseList(j.away_squade),
    stage:       String(j.stage ?? ''),
  };
}

function parsePlayers(j: Record<string, unknown>): Players {
  return {
    coach:       parseList(j.coach),
    goalkeepers: parseList(j.goalkeepers),
    defenders:   parseList(j.defenders),
    midfielders: parseList(j.midfielders),
    attackers:   parseList(j.attackers),
  };
}

function parseStaff(raw: unknown): Team['staff'] {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map(s => ({
      id: Number(s.id ?? 0),
      name: (parseLocalized(s.name) as Localized) ?? { ar: '', en: '' },
      role: (parseLocalized(s.role) as Localized) ?? null,
      current: Boolean(s.current),
    }));
}

function parseRoster(raw: unknown): Team['roster'] {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map(r => ({
      id: Number(r.id ?? 0),
      name: (parseLocalized(r.name) as Localized) ?? { ar: '', en: '' },
      shirt: r.shirt != null ? Number(r.shirt) : null,
      position: (parseLocalized(r.position) as Localized) ?? null,
      birthYear: Number(r.birth_year ?? 0),
      current: Boolean(r.current),
    }));
}

function parseTeam(j: Record<string, unknown>): Team {
  return {
    id:             String(j.team_id ?? ''),
    clubId:         j.club_id != null ? Number(j.club_id) : undefined,
    group:          parseLocalized(j.group),
    name:           parseLocalized(j.name) ?? '',
    logo:           j.logo ? String(j.logo) : undefined,
    field:          j.field ? String(j.field) : undefined,
    fieldurl:       j.fieldurl ? String(j.fieldurl) : undefined,
    clubName:       parseLocalized(j.club_name),
    city:           parseLocalized(j.city),
    information:    j.information ? String(j.information) : undefined,
    players:        j.players && typeof j.players === 'object'
                      ? parsePlayers(j.players as Record<string, unknown>)
                      : undefined,
    staff:          parseStaff(j.staff),
    roster:         parseRoster(j.roster),
    pointDeduction: parseInt(String(j.point_deduction ?? '0'), 10) || 0,
  };
}

function parseSectors(raw: unknown, urlRaw: unknown): Sector[] {
  const sectors: Sector[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const arNames = parseList(obj.ar);
    const enNames = parseList(obj.en);
    const urls = parseList(urlRaw);
    for (let i = 0; i < urls.length; i++) {
      if (!urls[i]) continue;
      sectors.push({
        name: { ar: arNames[i] ?? '', en: enNames[i] ?? '' },
        url: urls[i],
      });
    }
  } else if (Array.isArray(raw)) {
    const urls = parseList(urlRaw);
    for (let i = 0; i < raw.length; i++) {
      const name = String(raw[i] ?? '');
      const url = urls[i] ?? '';
      if (name && url) sectors.push({ name: { ar: name, en: name }, url });
    }
  }
  return sectors;
}

function parseAgeGroup(j: Record<string, unknown>): AgeGroup {
  const sectorRaw = j.sector;
  const urlRaw = j.matchesurl;
  const sectors = parseSectors(sectorRaw, urlRaw);

  let directUrl: string | undefined;
  if (sectors.length === 0) {
    if (typeof urlRaw === 'string' && urlRaw) directUrl = urlRaw;
    else if (Array.isArray(urlRaw) && urlRaw[0]) directUrl = String(urlRaw[0]);
  }

  return {
    age: String(j.age ?? ''),
    ageName: (parseLocalized(j.age_name) as Localized) ?? undefined,
    matchDays: Array.isArray(j.match_days) ? j.match_days.map(Number) : undefined,
    directMatchesUrl: directUrl,
    sectors,
  };
}

function parseCompetition(j: Record<string, unknown>): Competition {
  const nameRaw = j.name;
  let name: { ar: string; en: string };
  if (nameRaw && typeof nameRaw === 'object' && !Array.isArray(nameRaw)) {
    const obj = nameRaw as Record<string, string>;
    name = { ar: obj.ar ?? '', en: obj.en ?? '' };
  } else {
    const s = String(nameRaw ?? '');
    name = { ar: s, en: s };
  }
  return {
    id: String(j.competition_id ?? ''),
    name,
    ages: (Array.isArray(j.ages) ? j.ages : [])
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .map(parseAgeGroup),
  };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchConfig(): Promise<ConfigData> {
  const cfgRes = await fetch(CONFIG_URL, { next: { revalidate: 300 } });
  const cfgJson = await cfgRes.json();
  const dataUrl: string = cfgJson.latestDataUrl;
  const dataRes = await fetch(dataUrl, { next: { revalidate: 300 } });
  const data = await dataRes.json();

  return {
    seasons: (Array.isArray(data.seasons) ? data.seasons : [])
      .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((s: Record<string, unknown>) => ({
        name: parseLocalized(s.season) ?? '',
        competitions: (Array.isArray(s.competitions) ? s.competitions : [])
          .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .map(parseCompetition),
      } as Season)),
    venues: (Array.isArray(data.venues) ? data.venues : [])
      .filter((v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null)
      .map((v: Record<string, unknown>) => ({
        venue_id: String(v.venue_id ?? ''),
        name: parseLocalized(v.name) ?? '',
        url: v.url ? String(v.url) : undefined,
      })),
    news: (Array.isArray(data.news) ? data.news : [])
      .filter((n: unknown): n is Record<string, unknown> => typeof n === 'object' && n !== null)
      .map((n: Record<string, unknown>) => ({
        date:    String(n.date ?? ''),
        title:   parseLocalized(n.title) ?? '',
        image:   n.image ? String(n.image) : undefined,
        details: parseLocalized(n.details),
        images:  parseList(n.images).filter(s => s.startsWith('http')),
      }))
      .sort((a: {date: string}, b: {date: string}) => b.date.localeCompare(a.date)),
    ads: (Array.isArray(data.Ads) ? data.Ads : [])
      .filter((a: unknown): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .map((a: Record<string, unknown>) => ({
        id:               Number(a.id ?? 0),
        name:             String(a.name ?? ''),
        image:            a.image            ? String(a.image)            : undefined,
        youtube_video:    a.youtube_video    ? String(a.youtube_video)    : undefined,
        facebook_link:    a.facebook_link    ? String(a.facebook_link)    : undefined,
        mobile_number:    a.mobile_number    ? String(a.mobile_number)    : undefined,
        whatsapp_number:  a.whatsapp_number  ? String(a.whatsapp_number)  : undefined,
        location:         a.location         ? String(a.location)         : undefined,
        location_url:     a.location_url     ? String(a.location_url)     : undefined,
        link:             a.link             ? String(a.link)             : undefined,
        weight:           Number(a.weight ?? 1),
        placement:        a.placement        ? String(a.placement)        : 'interstitial',
        feed_position:    a.feed_position != null ? Number(a.feed_position) : undefined,
        feed_repeat:      a.feed_repeat    != null ? Number(a.feed_repeat)  : undefined,
        expire_date:      a.expire_date      ? String(a.expire_date)      : undefined,
      })),
    app_version: data.app_version,
  };
}

function parseHomeMatch(j: Record<string, unknown>): HomeMatch {
  const comp = (j.competition ?? {}) as Record<string, unknown>;
  const parseTeam = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return undefined;
    const t = raw as Record<string, unknown>;
    return {
      id: String(t.id ?? ''),
      name: parseLocalized(t.name) ?? String(t.id ?? ''),
      logo: t.logo ? String(t.logo) : undefined,
    };
  };
  return {
    id:          String(j.id ?? ''),
    date:        String(j.date ?? ''),
    time:        String(j.time ?? ''),
    status:      String(j.status ?? ''),
    group:       String(j.group ?? ''),
    venue:       String(j.venue ?? ''),
    note:        j.note ? String(j.note) : undefined,
    homeScore:   parseInt2(j.home_score),
    awayScore:   parseInt2(j.away_score),
    homePenalty: parseInt2(j.home_penalty),
    awayPenalty: parseInt2(j.away_penalty),
    competition: {
      id:      Number(comp.id ?? 0),
      code:    String(comp.code ?? ''),
      name:    (parseLocalized(comp.name) as Localized) ?? { ar: '', en: '' },
      age:     String(comp.age ?? ''),
      ageName: (parseLocalized(comp.age_name) as Localized) ?? null,
      sector:  (parseLocalized(comp.sector) as Localized) ?? null,
      title:   (parseLocalized(comp.title) as Localized) ?? { ar: '', en: '' },
      dataUrl: String(comp.data_url ?? ''),
    },
    homeTeam: parseTeam(j.home_team),
    awayTeam: parseTeam(j.away_team),
  };
}

export interface MatchQuery {
  from?: string;      // YYYY-MM-DD, inclusive
  to?: string;        // YYYY-MM-DD, inclusive
  order?: 'asc' | 'desc';
  limit?: number;
}

export async function fetchAllMatches(query: MatchQuery = {}): Promise<HomeMatch[]> {
  const p = new URLSearchParams();
  if (query.from)  p.set('from', query.from);
  if (query.to)    p.set('to', query.to);
  if (query.order) p.set('order', query.order);
  p.set('limit', String(query.limit ?? 300));
  const res = await fetch(`${API_ORIGIN}/api/matches?${p.toString()}`, { cache: 'no-store' });
  const j = await res.json();
  return (Array.isArray(j.matches) ? j.matches : [])
    .filter((m: unknown): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map(parseHomeMatch);
}

export async function fetchMatchFull(id: string | number) {
  const res = await fetch(`${API_ORIGIN}/api/matches/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as import('./types').MatchFull;
}

export async function fetchPlayer(id: string | number) {
  const res = await fetch(`${API_ORIGIN}/api/players/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as import('./types').PlayerFull;
}

export async function fetchCoach(id: string | number) {
  const res = await fetch(`${API_ORIGIN}/api/coaches/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as import('./types').CoachFull;
}

export async function fetchClub(id: string | number) {
  const res = await fetch(`${API_ORIGIN}/api/clubs/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as import('./types').ClubPublic;
}

export async function fetchSearch(q: string): Promise<import('./types').SearchResults> {
  const empty = { clubs: [], players: [], coaches: [] };
  const term = q.trim();
  if (term.length < 2) return empty;
  const res = await fetch(`${API_ORIGIN}/api/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' });
  if (!res.ok) return empty;
  return (await res.json()) as import('./types').SearchResults;
}

export async function fetchClubs() {
  const res = await fetch(`${API_ORIGIN}/api/clubs`, { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const j = await res.json();
  return (j.clubs ?? []) as import('./types').ClubListItem[];
}

export async function fetchTeam(id: string | number, seasonId?: string | number | null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  const res = await fetch(`${API_ORIGIN}/api/teams/${id}${q}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as import('./types').TeamPublic;
}

function parseStandings(raw: unknown): CompetitionData['standings'] {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
    .map(b => ({
      group: (parseLocalized(b.group) as Localized) ?? null,
      rows: (Array.isArray(b.rows) ? b.rows : [])
        .filter((r: unknown): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r: Record<string, unknown>) => ({
          teamId: String(r.team_id ?? ''),
          position: Number(r.position ?? 0),
          played: Number(r.played ?? 0),
          won: Number(r.won ?? 0),
          drawn: Number(r.drawn ?? 0),
          lost: Number(r.lost ?? 0),
          goalsFor: Number(r.goals_for ?? 0),
          goalsAgainst: Number(r.goals_against ?? 0),
          points: Number(r.points ?? 0),
          goalDiff: Number(r.goal_diff ?? 0),
          pointDeduction: Number(r.point_deduction ?? 0),
        })),
    }));
}

export async function fetchCompetition(url: string): Promise<CompetitionData> {
  const res = await fetch(url, { next: { revalidate: 120 } });
  const j = await res.json();
  const meta = j.competition as { id?: number; title?: Localized } | undefined;
  return {
    competition: meta && meta.id != null
      ? { id: Number(meta.id), title: (meta.title ?? { ar: '', en: '' }) as Localized }
      : undefined,
    matches: (Array.isArray(j.matches) ? j.matches : [])
      .filter((m: unknown): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map(parseMatch),
    teams: (Array.isArray(j.teams) ? j.teams : [])
      .filter((t: unknown): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map(parseTeam),
    venues: parseList(j.venues),
    standings: parseStandings(j.standings),
  };
}
