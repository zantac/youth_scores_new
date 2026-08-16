// Resolve the raw OCR strings to real team/venue records. OCR only has to be
// "close" — team and venue names already live in the DB (the admin enters a
// couple of rounds by hand first), so a fuzzy match against that known list
// snaps garbled/reversed spellings onto the right record. Anything below the
// confidence threshold is left unset and flagged for the admin to pick.

import type { RawFixture } from './gridReconstruct';

export interface TeamCandidate {
  id: number;
  /** All spellings to match against (e.g. [name.ar, name.en]). */
  names: string[];
}

export interface MatchedTeam {
  id: number | null;
  score: number; // 0..1
}

export interface MatchedFixture {
  home: MatchedTeam;
  away: MatchedTeam;
  venue: { value: string; score: number; matched: boolean };
  date: string;
  time: string;
  week: string; // the الأسبوع column value from the photo
  raw: RawFixture;
}

// Accept a match automatically at/above this score; below it, leave blank + warn.
export const TEAM_MATCH_THRESHOLD = 0.5;
export const VENUE_MATCH_THRESHOLD = 0.55;

// Fold Arabic so spelling variants collapse: drop diacritics/tatweel, unify
// alef/ya/ta-marbuta forms, strip non-letters, collapse spaces.
function fold(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-يa-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const reverse = (s: string) => [...s].reverse().join('');

// Character-bigram sets → Dice coefficient. Order-insensitive and forgiving of
// a few wrong letters, which suits noisy OCR of short names.
function bigrams(s: string): Map<string, number> {
  const clean = s.replace(/\s+/g, '');
  const m = new Map<string, number>();
  if (clean.length < 2) {
    if (clean) m.set(clean, 1);
    return m;
  }
  for (let i = 0; i < clean.length - 1; i++) {
    const bg = clean.slice(i, i + 2);
    m.set(bg, (m.get(bg) ?? 0) + 1);
  }
  return m;
}

function dice(aFold: string, bFold: string): number {
  if (!aFold || !bFold) return 0;
  const a = bigrams(aFold);
  const b = bigrams(bFold);
  let inter = 0, aTot = 0, bTot = 0;
  for (const v of a.values()) aTot += v;
  for (const [k, v] of b) { bTot += v; const av = a.get(k); if (av) inter += Math.min(av, v); }
  return (2 * inter) / (aTot + bTot);
}

/** Best similarity of an OCR string against one candidate's spellings. */
function scoreAgainst(queryFold: string, queryRevFold: string, names: string[]): number {
  let best = 0;
  for (const n of names) {
    const nf = fold(n);
    if (!nf) continue;
    best = Math.max(best, dice(queryFold, nf), dice(queryRevFold, nf));
  }
  return best;
}

function bestTeam(query: string, candidates: TeamCandidate[]): MatchedTeam {
  const qf = fold(query);
  if (!qf) return { id: null, score: 0 };
  const qrf = fold(reverse(query));
  let bestId: number | null = null, bestScore = 0;
  for (const c of candidates) {
    const s = scoreAgainst(qf, qrf, c.names);
    if (s > bestScore) { bestScore = s; bestId = c.id; }
  }
  return bestId != null && bestScore >= TEAM_MATCH_THRESHOLD
    ? { id: bestId, score: bestScore }
    : { id: null, score: bestScore };
}

function bestVenue(query: string, venues: string[]): { value: string; score: number; matched: boolean } {
  const qf = fold(query);
  if (!qf) return { value: '', score: 0, matched: false };
  const qrf = fold(reverse(query));
  let bestV = '', bestScore = 0;
  for (const v of venues) {
    const s = scoreAgainst(qf, qrf, [v]);
    if (s > bestScore) { bestScore = s; bestV = v; }
  }
  // Snap to a known venue when confident; otherwise keep the raw OCR text so the
  // admin can accept it as a new venue name.
  return bestScore >= VENUE_MATCH_THRESHOLD
    ? { value: bestV, score: bestScore, matched: true }
    : { value: query, score: bestScore, matched: false };
}

export function matchFixtures(
  fixtures: RawFixture[],
  teams: TeamCandidate[],
  venues: string[],
): MatchedFixture[] {
  return fixtures.map((raw) => ({
    home: bestTeam(raw.home, teams),
    away: bestTeam(raw.away, teams),
    venue: bestVenue(raw.venue, venues),
    date: raw.date,
    time: raw.time,
    week: raw.round,
    raw,
  }));
}
