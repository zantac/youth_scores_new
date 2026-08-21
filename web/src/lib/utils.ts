import type { Match, Team, Standing, PlayerStat, TeamGoalStat, Localized } from './types';

// ── Date ──────────────────────────────────────────────────────────────────────

export function todayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function formatMatchDate(dateStr: string, locale: string): string {
  if (!dateStr) return locale === 'ar' ? 'غير محدد' : 'TBD';
  try {
    const dt = new Date(dateStr);
    const today = todayStr();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    if (dateStr === today) return locale === 'ar' ? 'اليوم' : 'Today';
    if (dateStr === tomStr) return locale === 'ar' ? 'غداً' : 'Tomorrow';
    return dt.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch { return dateStr; }
}

export function formatNewsDate(dateStr: string, locale: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

export function isRecent(dateStr: string): boolean {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    return diff < 2 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export function countdownLabel(date: string, time: string, locale: string): string | null {
  if (!date) return null;  // no date yet (TBD) — nothing to count down to
  try {
    const [y, mo, d] = date.split('-').map(Number);
    const [h = 0, mi = 0] = (time || '').split(':').map(Number);
    const matchDt = new Date(y, mo - 1, d, h, mi);
    const now = new Date();
    if (matchDt <= now) return null;
    const diff = matchDt.getTime() - now.getTime();
    const isAr = locale === 'ar';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor(diff / 60000);
    if (days >= 2) return isAr ? `بعد ${days} أيام` : `in ${days}d`;
    if (days === 1) return isAr ? 'غداً' : 'Tomorrow';
    if (hours >= 1) return isAr ? `بعد ${hours}س` : `in ${hours}h`;
    if (mins >= 1) return isAr ? `بعد ${mins}د` : `in ${mins}m`;
    return isAr ? 'قريباً' : 'Soon';
  } catch { return null; }
}

// ── Standings ─────────────────────────────────────────────────────────────────

export function calcStandings(matches: Match[], teams: Team[], groupId?: string): Standing[] {
  const map = new Map<string, Standing>();
  for (const t of teams) {
    if (groupId && groupKey(t.group) !== groupId) continue;
    map.set(t.id, {
      teamId: t.id, position: 0, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: -t.pointDeduction,
      goalDiff: 0, pointDeduction: t.pointDeduction,
    });
  }

  // Pre-filter eligible matches — reused for H2H checks
  const eligible = matches.filter(m =>
    m.stage.toLowerCase() !== 'knockout' &&
    m.status.toLowerCase() === 'completed' &&
    m.homeScore != null && m.awayScore != null
  );

  for (const m of eligible) {
    const home = map.get(m.homeTeamId);
    const away = map.get(m.awayTeamId);
    if (!home && !away) continue;
    if (home) {
      home.played++; home.goalsFor += m.homeScore!; home.goalsAgainst += m.awayScore!;
      if (m.homeScore! > m.awayScore!) { home.won++; home.points += 3; }
      else if (m.homeScore === m.awayScore) { home.drawn++; home.points++; }
      else { home.lost++; }
    }
    if (away) {
      away.played++; away.goalsFor += m.awayScore!; away.goalsAgainst += m.homeScore!;
      if (m.awayScore! > m.homeScore!) { away.won++; away.points += 3; }
      else if (m.awayScore === m.homeScore) { away.drawn++; away.points++; }
      else { away.lost++; }
    }
  }

  // Primary sort by points
  const all = Array.from(map.values())
    .map(s => ({ ...s, goalDiff: s.goalsFor - s.goalsAgainst }));
  all.sort((a, b) => b.points - a.points);

  // Apply tiebreakers within each same-points group
  const result: Standing[] = [];
  let i = 0;
  while (i < all.length) {
    let j = i + 1;
    while (j < all.length && all[j].points === all[i].points) j++;
    const group = all.slice(i, j);
    if (group.length === 1) { result.push(group[0]); }
    else { result.push(..._breakTie(group, eligible)); }
    i = j;
  }

  result.forEach((s, idx) => { s.position = idx + 1; });
  return result;
}

function _breakTie(tied: Standing[], eligible: Match[]): Standing[] {
  const tiedIds = new Set(tied.map(s => s.teamId));
  const ids = [...tiedIds];

  // Matches played only between the tied teams
  const h2hMatches = eligible.filter(m =>
    tiedIds.has(m.homeTeamId) && tiedIds.has(m.awayTeamId)
  );

  // Condition: every pair must have played exactly 2 matches
  let allPlayedTwice = true;
  outer: for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const count = h2hMatches.filter(m =>
        (m.homeTeamId === ids[i] && m.awayTeamId === ids[j]) ||
        (m.homeTeamId === ids[j] && m.awayTeamId === ids[i])
      ).length;
      if (count !== 2) { allPlayedTwice = false; break outer; }
    }
  }

  if (!allPlayedTwice) {
    // Fallback: overall GD → overall GF
    return [...tied].sort((a, b) => (b.goalDiff - a.goalDiff) || (b.goalsFor - a.goalsFor));
  }

  // Build H2H mini-table
  const h2h = new Map<string, { points: number; goalsFor: number; goalsAgainst: number }>();
  for (const s of tied) h2h.set(s.teamId, { points: 0, goalsFor: 0, goalsAgainst: 0 });

  for (const m of h2hMatches) {
    const home = h2h.get(m.homeTeamId)!;
    const away = h2h.get(m.awayTeamId)!;
    home.goalsFor += m.homeScore!; home.goalsAgainst += m.awayScore!;
    away.goalsFor += m.awayScore!; away.goalsAgainst += m.homeScore!;
    if (m.homeScore! > m.awayScore!) { home.points += 3; }
    else if (m.homeScore === m.awayScore) { home.points++; away.points++; }
    else { away.points += 3; }
  }

  return [...tied].sort((a, b) => {
    const ha = h2h.get(a.teamId)!;
    const hb = h2h.get(b.teamId)!;
    return (
      (hb.points - ha.points) ||                                   // H2H points
      ((hb.goalsFor - hb.goalsAgainst) - (ha.goalsFor - ha.goalsAgainst)) || // H2H GD
      (b.goalDiff - a.goalDiff) ||                                 // Overall GD
      (b.goalsFor - a.goalsFor)                                    // Overall GF
    );
  });
}

export function standingsByGroup(matches: Match[], teams: Team[]): Map<string, Standing[]> {
  const groups = [...new Set(teams.map(t => groupKey(t.group)).filter(Boolean))].sort();
  if (groups.length === 0) return new Map([['', calcStandings(matches, teams)]]);
  return new Map(groups.map(g => [g, calcStandings(matches, teams, g)]));
}

export function teamForm(teamId: string, matches: Match[]): ('W' | 'D' | 'L')[] {
  return matches
    .filter(m => (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
                  m.status.toLowerCase() === 'completed' &&
                  m.homeScore != null && m.awayScore != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(m => {
      const isHome = m.homeTeamId === teamId;
      const gf = isHome ? m.homeScore! : m.awayScore!;
      const ga = isHome ? m.awayScore! : m.homeScore!;
      return gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

const ASSIST_DELIMITERS = ['صناعة الاهداف', 'assists'];

function parseEventList(events: string[], teamId: string, teams: Team[], map: Map<string, PlayerStat>, forScorers: boolean) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return;
  let inAssists = false;
  for (const entry of events) {
    const lower = entry.toLowerCase().trim();
    if (ASSIST_DELIMITERS.some(d => lower === d.toLowerCase())) { inAssists = true; continue; }
    if (forScorers && inAssists) continue;
    if (!forScorers && !inAssists) continue;
    const parts = entry.trim().split(/\s+/);
    let name = entry.trim(), count = 1;
    if (parts.length > 1) {
      const last = parseInt(parts[parts.length - 1].replace(/[()x×]/g, ''), 10);
      if (!isNaN(last)) { count = last; name = parts.slice(0, -1).join(' '); }
    }
    if (!name) continue;
    const key = `${teamId}:${name}`;
    const existing = map.get(key);
    if (existing) existing.count += count;
    else map.set(key, { name, teamId, teamName: team.name, count });
  }
}

export function topScorers(matches: Match[], teams: Team[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const m of matches) {
    if (m.status.toLowerCase() !== 'completed') continue;
    parseEventList(m.homeScorers, m.homeTeamId, teams, map, true);
    parseEventList(m.awayScorers, m.awayTeamId, teams, map, true);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function topAssisters(matches: Match[], teams: Team[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const m of matches) {
    if (m.status.toLowerCase() !== 'completed') continue;
    parseEventList(m.homeScorers, m.homeTeamId, teams, map, false);
    parseEventList(m.awayScorers, m.awayTeamId, teams, map, false);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function cleanSheets(matches: Match[], teams: Team[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const m of matches) {
    if (m.status.toLowerCase() !== 'completed' || m.homeScore == null || m.awayScore == null) continue;
    const record = (teamId: string) => {
      const team = teams.find(t => t.id === teamId);
      if (!team) return;
      const gks = team.players?.goalkeepers ?? [];
      if (gks.length === 0) {
        const k = teamId;
        const e = map.get(k);
        if (e) e.count++;
        else map.set(k, { name: localize(team.name, 'ar'), teamId, teamName: team.name, count: 1 });
      } else {
        for (const gk of gks) {
          const k = `${teamId}:${gk}`;
          const e = map.get(k);
          if (e) e.count++;
          else map.set(k, { name: gk, teamId, teamName: team.name, count: 1 });
        }
      }
    };
    if (m.awayScore === 0) record(m.homeTeamId);
    if (m.homeScore === 0) record(m.awayTeamId);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function yellowCards(matches: Match[], teams: Team[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  const count = (cards: string[], teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    for (const c of cards) {
      const name = c.trim();
      if (!name) continue;
      const k = `${teamId}:${name}`;
      const e = map.get(k);
      if (e) e.count++;
      else map.set(k, { name, teamId, teamName: team.name, count: 1 });
    }
  };
  for (const m of matches) { count(m.homeYc, m.homeTeamId); count(m.awayYc, m.awayTeamId); }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function redCards(matches: Match[], teams: Team[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  const count = (cards: string[], teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    for (const c of cards) {
      const name = c.trim();
      if (!name) continue;
      const k = `${teamId}:${name}`;
      const e = map.get(k);
      if (e) e.count++;
      else map.set(k, { name, teamId, teamName: team.name, count: 1 });
    }
  };
  for (const m of matches) { count(m.homeRc, m.homeTeamId); count(m.awayRc, m.awayTeamId); }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function teamGoalStats(matches: Match[], teams: Team[]): TeamGoalStat[] {
  const map = new Map<string, [number, number]>();
  for (const m of matches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const h = map.get(m.homeTeamId) ?? [0, 0]; h[0] += m.homeScore; h[1] += m.awayScore; map.set(m.homeTeamId, h);
    const a = map.get(m.awayTeamId) ?? [0, 0]; a[0] += m.awayScore; a[1] += m.homeScore; map.set(m.awayTeamId, a);
  }
  return [...map.entries()].map(([teamId, [gf, ga]]) => {
    const team = teams.find(t => t.id === teamId);
    return { teamId, teamName: team?.name ?? { ar: teamId, en: teamId }, goalsFor: gf, goalsAgainst: ga };
  });
}

export function splitScorers(raw: string[]): { goals: string[]; assists: string[] } {
  const goals: string[] = [], assists: string[] = [];
  let inAssists = false;
  for (const s of raw) {
    const lower = s.toLowerCase().trim();
    if (ASSIST_DELIMITERS.some(d => lower === d.toLowerCase())) { inAssists = true; continue; }
    if (inAssists) assists.push(s); else goals.push(s);
  }
  return { goals, assists };
}

// ── Locale ────────────────────────────────────────────────────────────────────

export function localize(val: string | { ar: string; en: string } | undefined | null, locale: string, fallback = ''): string {
  if (val == null) return fallback;
  if (typeof val === 'string') return val || fallback;
  return (locale === 'ar' ? (val.ar || val.en) : (val.en || val.ar)) || fallback;
}

// ── Roster grouping ─────────────────────────────────────────────────────────

// Roster players are shown in these position groups, in pitch order. A player
// is matched by their Arabic position (ى/ي tolerant), falling back to English.
export const POSITION_GROUPS = [
  { key: 'gk',  ar: 'حراس المرمي', en: 'Goalkeepers', matchAr: 'حارس مرمي', matchEn: 'goalkeeper' },
  { key: 'def', ar: 'المدافعون',   en: 'Defenders',   matchAr: 'مدافع',      matchEn: 'defender' },
  { key: 'mid', ar: 'لاعبو الوسط', en: 'Midfielders', matchAr: 'لاعب وسط',   matchEn: 'midfielder' },
  { key: 'fwd', ar: 'المهاجمون',   en: 'Forwards',    matchAr: 'مهاجم',       matchEn: 'forward' },
] as const;

const normArabic = (s?: string | null) => (s ?? '').trim().replace(/ى/g, 'ي');

/** The position group a player belongs to, or 'other' when unrecognised/empty. */
export function positionGroupKey(position: Localized | null | undefined): string {
  const ar = normArabic(position?.ar);
  const en = (position?.en ?? '').trim().toLowerCase();
  return POSITION_GROUPS.find(g => (ar && ar === g.matchAr) || (en && en === g.matchEn))?.key ?? 'other';
}

/**
 * Split a roster into position sections (keeper → attack), each sorted
 * alphabetically by name, dropping empty groups. Anything with an unknown or
 * missing position falls into a final "أخرى / Other" section so no one is hidden.
 */
export function groupRosterByPosition<T extends { name: Localized; position: Localized | null }>(
  roster: T[], locale: string,
): { label: string; players: T[] }[] {
  const isAr = locale === 'ar';
  const buckets: Record<string, T[]> = {};
  for (const p of roster) (buckets[positionGroupKey(p.position)] ??= []).push(p);
  const byName = (a: T, b: T) => localize(a.name, locale).localeCompare(localize(b.name, locale), 'ar');
  return [
    ...POSITION_GROUPS.map(g => ({ label: isAr ? g.ar : g.en, players: buckets[g.key] ?? [] })),
    { label: isAr ? 'أخرى' : 'Other', players: buckets['other'] ?? [] },
  ].filter(s => s.players.length > 0).map(s => ({ label: s.label, players: [...s.players].sort(byName) }));
}

/**
 * A team's name split into the club it is registered as and the name it plays
 * under, for the two-line form used in the standings and fixtures.
 *
 * Players register with the federation under the club, so the club leads and
 * the team's own name — an academy's branding, a sponsor — sits beneath it.
 * `alias` is null when the team does not override the club name, which is the
 * ordinary case, and then only one line is drawn.
 */
export function teamNameLines(
  team: { name: string | { ar: string; en: string }; clubName?: string | { ar: string; en: string } } | undefined,
  locale: string,
  fallback = '',
): { primary: string; alias: string | null } {
  const name = localize(team?.name, locale, fallback);
  const club = localize(team?.clubName, locale, '');
  if (!club || club === name) return { primary: name, alias: null };
  return { primary: club, alias: name };
}

export function groupKey(group: string | { ar: string; en: string } | undefined): string {
  if (!group) return '';
  if (typeof group === 'string') return group;
  return group.ar || group.en || '';
}

export function getCompName(comp: { name: string | { ar: string; en: string } }, locale: string): string {
  if (typeof comp.name === 'string') return comp.name;
  return locale === 'ar' ? (comp.name.ar || comp.name.en) : (comp.name.en || comp.name.ar);
}

type LocVal = string | { ar: string; en: string } | undefined | null;

/** Builds the competition page title in both languages so the heading can
 *  re-localize when the user toggles language (rather than freezing whatever
 *  locale was active at navigation time). */
export function buildCompTitle(name: LocVal, age: LocVal, sector: LocVal, sep = ' - '): { ar: string; en: string } {
  const build = (loc: string) =>
    [name, age, sector].map(v => (v ? localize(v, loc) : '')).filter(Boolean).join(sep);
  return { ar: build('ar'), en: build('en') };
}

// ── Safe external links ───────────────────────────────────────────────────────

/**
 * Allow only web-safe schemes for admin/user-supplied link fields before they
 * go into an <a href>. Blocks `javascript:`/`data:`/etc. (stored-XSS vectors).
 * Bare domains ("example.com/x") are upgraded to https. Anything else → undefined
 * so callers can drop the href entirely.
 */
export function safeUrl(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  const s = u.trim();
  if (!s) return undefined;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  // Scheme-less but clearly a domain (has a dot, no control/scheme chars).
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return undefined;
}

/**
 * Whether an ad is still live: no expiry, or a parseable expiry still in the
 * future. An unparseable date is treated as non-expiring (fail open) rather than
 * silently dropping the ad.
 */
export function adNotExpired(expireDate: string | undefined, now: Date = new Date()): boolean {
  if (!expireDate) return true;
  const d = new Date(expireDate);
  return Number.isNaN(d.getTime()) ? true : d > now;
}
