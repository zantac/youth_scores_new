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
  /** true when the admin should double-check (a low-confidence guess, or blank). */
  needsReview: boolean;
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

// Above CONFIDENT → auto-accept silently. Between GUESS_FLOOR and CONFIDENT →
// pre-fill the best guess but flag it for review. Below GUESS_FLOOR → leave
// blank. Two strong, near-tied candidates → blank (can't tell them apart).
export const TEAM_MATCH_THRESHOLD = 0.5;
export const TEAM_GUESS_FLOOR = 0.3;
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

// Token (whole-word) Jaccard. This is what separates subset names like
// "الأهلي" from "البنك الأهلي": the distinctive word "البنك" only overlaps when
// it's actually present, so the two stop looking identical.
function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// Blend character similarity (tolerant of OCR letter noise) with token overlap
// (tolerant of word order, strict about which words are present).
function similarity(qFold: string, qTokens: string[], name: string): number {
  const nf = fold(name);
  if (!nf) return 0;
  const d = dice(qFold, nf);
  const j = jaccard(qTokens, nf.split(' ').filter(Boolean));
  return 0.6 * d + 0.4 * j;
}

/** Best similarity of an OCR string (both orientations) against one candidate. */
function scoreAgainst(qf: string, qft: string[], qrf: string, qrt: string[], names: string[]): number {
  let best = 0;
  for (const n of names) {
    best = Math.max(best, similarity(qf, qft, n), similarity(qrf, qrt, n));
  }
  return best;
}

const tokensOf = (folded: string) => folded.split(' ').filter(Boolean);

// Require the winner to beat the runner-up by this much; otherwise the two
// candidates are too alike (e.g. الأهلي vs البنك الأهلي on a noisy read) and we
// leave it blank so the admin disambiguates rather than guess wrong.
const AMBIGUITY_MARGIN = 0.12;

function bestTeam(query: string, candidates: TeamCandidate[]): MatchedTeam {
  const qf = fold(query);
  if (!qf) return { id: null, score: 0, needsReview: true };
  const qft = tokensOf(qf);
  const qrf = fold(reverse(query));
  const qrt = tokensOf(qrf);

  let bestId: number | null = null, bestScore = 0, secondScore = 0;
  for (const c of candidates) {
    const s = scoreAgainst(qf, qft, qrf, qrt, c.names);
    if (s > bestScore) { secondScore = bestScore; bestScore = s; bestId = c.id; }
    else if (s > secondScore) { secondScore = s; }
  }
  if (bestId == null) return { id: null, score: 0, needsReview: true };
  // Ambiguous only when the runner-up is ALSO strong and near-tied (e.g. الأهلي
  // vs البنك الأهلي) — then we can't safely guess, so leave it blank.
  const ambiguous = secondScore >= TEAM_MATCH_THRESHOLD && (bestScore - secondScore) < AMBIGUITY_MARGIN;
  if (ambiguous) return { id: null, score: bestScore, needsReview: true };
  if (bestScore >= TEAM_MATCH_THRESHOLD) return { id: bestId, score: bestScore, needsReview: false };
  if (bestScore >= TEAM_GUESS_FLOOR) return { id: bestId, score: bestScore, needsReview: true }; // flagged guess
  return { id: null, score: bestScore, needsReview: true };
}

function bestVenue(query: string, venues: string[]): { value: string; score: number; matched: boolean } {
  const qf = fold(query);
  if (!qf) return { value: '', score: 0, matched: false };
  const qft = tokensOf(qf);
  const qrf = fold(reverse(query));
  const qrt = tokensOf(qrf);
  let bestV = '', bestScore = 0;
  for (const v of venues) {
    const s = scoreAgainst(qf, qft, qrf, qrt, [v]);
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
