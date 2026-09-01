// Turn positioned OCR words into fixture rows. The table columns are fixed, so
// rather than trust the OCR's line grouping we rebuild the grid from geometry:
// cluster words into rows by Y, locate columns from the header row, then read
// each cell out of its column band. Home = the team cell nearer the date column
// (higher X in this RTL table); away = the cell nearer the venue column.

import type { OcrWord } from './ocrEngine';

export interface RawFixture {
  round: string;
  date: string; // YYYY-MM-DD, or '' if unreadable
  time: string; // HH:MM, or ''
  home: string;
  away: string;
  venue: string;
  /** Lowest confidence among the row's key cells (0..1). */
  conf: number;
  y: number;
}

export interface ReconstructResult {
  fixtures: RawFixture[];
  warnings: string[];
  orientation: 'logical' | 'visual';
  columns: Record<string, number>;
}

// ── text helpers ──────────────────────────────────────────────────────────────

const reverse = (s: string) => [...s].reverse().join('');

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const a = AR_DIGITS.indexOf(d);
    return String(a >= 0 ? a : FA_DIGITS.indexOf(d));
  });
}

// Fold for header-keyword matching only (not for team matching).
function foldAr(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

// Column header → keyword (folded, logical order).
const HEADERS: Record<string, string> = {
  time: 'توقيت',
  venue: 'ملعب',
  teams: 'فريق',
  teams2: 'تبار', // المتباريان — same column as الفريقان
  date: 'تاريخ',
  day: 'يوم',
  match: 'مباراه',
  round: 'اسبوع',
};

// Day-of-week words to exclude from the name tokens (folded spellings).
const DAY_NAMES = new Set(
  ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعه', 'السبت'].map(foldAr));

// ── row clustering ────────────────────────────────────────────────────────────

function clusterRows(words: OcrWord[]): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.cy - b.cy);
  const heights = sorted.map((w) => w.h).filter((h) => h > 0).sort((a, b) => a - b);
  const medH = heights.length ? heights[Math.floor(heights.length / 2)] : 16;
  const rows: OcrWord[][] = [];
  let cur: OcrWord[] = [];
  for (const w of sorted) {
    if (cur.length && w.cy - cur[cur.length - 1].cy > medH * 0.7) {
      rows.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) rows.push(cur);
  return rows;
}

// ── column detection from the header row ──────────────────────────────────────

interface Columns {
  centres: Record<string, number>;
  orientation: 'logical' | 'visual';
}

function detectColumns(headerRow: OcrWord[]): Columns {
  const centres: Record<string, number> = {};
  let visualVotes = 0, logicalVotes = 0;

  for (const w of headerRow) {
    const logical = foldAr(w.text);
    const visual = foldAr(reverse(w.text));
    for (const [col, kw] of Object.entries(HEADERS)) {
      if (logical.includes(kw)) { centres[col] = w.cx; logicalVotes++; }
      else if (visual.includes(kw)) { centres[col] = w.cx; visualVotes++; }
    }
  }
  // Merge the two "teams" header tokens into one centre.
  if (centres.teams2 != null) {
    centres.teams = centres.teams != null ? (centres.teams + centres.teams2) / 2 : centres.teams2;
    delete centres.teams2;
  }
  return { centres, orientation: visualVotes > logicalVotes ? 'visual' : 'logical' };
}

// Fallback column centres as fractions of image width (right-to-left table),
// used only if the header row can't be read.
function fallbackColumns(width: number): Record<string, number> {
  return {
    time: width * 0.15,
    venue: width * 0.29,
    teams: width * 0.52,
    date: width * 0.71,
    day: width * 0.8,
    round: width * 0.92,
  };
}

// ── cell parsers ──────────────────────────────────────────────────────────────

function parseDate(tokens: OcrWord[]): { value: string; conf: number } {
  for (const t of tokens) {
    const s = normalizeDigits(t.text);
    const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) {
      const [, y, mo, d] = m;
      return { value: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, conf: t.conf };
    }
  }
  return { value: '', conf: 0 };
}

function parseTime(tokens: OcrWord[]): { value: string; conf: number } {
  for (const t of tokens) {
    const s = normalizeDigits(t.text);
    const m = s.match(/(\d{1,2})\s*[.:,،]\s*(\d{2})/);
    if (m) {
      const h = m[1].padStart(2, '0');
      return { value: `${h}:${m[2]}`, conf: t.conf };
    }
  }
  return { value: '', conf: 0 };
}

// ── main ──────────────────────────────────────────────────────────────────────

export function reconstructFixtures(words: OcrWord[], imageWidth: number): ReconstructResult {
  const warnings: string[] = [];
  const clean = words.filter((w) => w.text.trim().length > 0);
  if (clean.length === 0) return { fixtures: [], warnings: ['No text detected'], orientation: 'logical', columns: {} };

  const rows = clusterRows(clean);
  // The header isn't always the first cluster — some layouts print a faint group
  // title (e.g. «المجموعة الثانية») on its own line above it. Pick, among the first
  // few rows, the one whose cells hit the most column keywords, and read the data
  // rows below it so the title line is skipped.
  let headerIdx = 0, bestHits = -1, detected: Record<string, number> = {};
  let orientation: 'logical' | 'visual' = 'logical';
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const c = detectColumns(rows[i]);
    const hits = Object.keys(c.centres).length;
    if (hits > bestHits) { bestHits = hits; headerIdx = i; detected = c.centres; orientation = c.orientation; }
  }

  let centres = detected;
  if (centres.date == null || centres.teams == null) {
    warnings.push('Header row unclear — using fallback column positions');
    centres = fallbackColumns(imageWidth);
  }
  const orient = (s: string) => (orientation === 'visual' ? reverse(s) : s);
  const dateCentre = centres.date ?? imageWidth * 0.71;
  const venueCentre = centres.venue ?? imageWidth * 0.29;
  const teamsCentre = centres.teams ?? imageWidth * 0.52;
  const timeCentre = centres.time ?? imageWidth * 0.15;
  // A name belongs to the venue column if its cluster sits left of here.
  const venueBoundary = (venueCentre + teamsCentre) / 2;
  // Names live strictly right of here. This drops the columns some layouts print
  // LEFT of the venue — the time column (cells like «١٠ص» carry an Arabic letter,
  // so a letter test alone wouldn't exclude them) and an empty result column —
  // which would otherwise be read as the leftmost cluster and mistaken for a venue.
  const nameLeftBound = (timeCentre + venueCentre) / 2;
  // Gaps wider than this separate columns / the × ; narrower ones are the spaces
  // between words of one name.
  const gapThreshold = imageWidth * 0.07;

  const fixtures: RawFixture[] = [];

  for (const row of rows.slice(headerIdx + 1)) {
    // Date/time by CONTENT, not position — so team words that sit close to the
    // date column aren't stolen by it (the bug that dropped home-team words).
    const date = parseDate(row);
    const time = parseTime(row);

    // The team + venue names are the tokens bearing an Arabic LETTER (ء-ي,
    // so pure date/time digit cells like «٤:٠٠» or «٢٠٢٦/٩/٧» are skipped) that sit
    // between the time column and the date column. Day names, the numeric
    // round/match columns to the right, and the time/result columns to the left
    // are all excluded.
    const nameToks = row.filter(w =>
      (/[ء-ي]/.test(w.text) || /^bye?$/i.test(w.text.trim())) &&  // Arabic name, or a Latin "by"/"bye" bye-marker
      !DAY_NAMES.has(foldAr(w.text)) &&
      w.cx > nameLeftBound && w.cx < dateCentre - 30);

    // Cluster the names on real gaps, then place clusters by position: the
    // leftmost (near the venue column) is the venue, the rest are home (rightmost,
    // next to the date) then away. Robust when the venue or a team is missing.
    const { home: homeW, away: awayW, venue: venueW } = splitRow(nameToks, venueBoundary, gapThreshold);

    const joinRtl = (ws: OcrWord[]) =>
      ws.slice().sort((a, b) => b.cx - a.cx).map((w) => orient(w.text)).join(' ').trim();
    const homeStr = joinRtl(homeW);
    const awayStr = joinRtl(awayW);
    const venueStr = joinRtl(venueW);

    if (!homeStr && !awayStr) continue; // stray header/footer line

    const confs = [date.conf, time.conf, ...homeW.map(w => w.conf), ...awayW.map(w => w.conf)].filter(c => c > 0);
    const conf = confs.length ? Math.min(...confs) : 0;

    fixtures.push({ round: '', date: date.value, time: time.value, home: homeStr, away: awayStr, venue: venueStr, conf, y: row[0].cy });
  }

  return { fixtures, warnings, orientation, columns: centres };
}

// Cluster name tokens on real column gaps, then assign clusters to home / away /
// venue by position. Keeps multi-word names intact and degrades gracefully when
// the venue or one team is missing (no forced over-split).
function splitRow(
  toks: OcrWord[], venueBoundary: number, gapThreshold: number,
): { home: OcrWord[]; away: OcrWord[]; venue: OcrWord[] } {
  const sorted = [...toks].sort((a, b) => b.cx - a.cx); // right → left
  const clusters: OcrWord[][] = [];
  let cur: OcrWord[] = [];
  for (const w of sorted) {
    if (cur.length && cur[cur.length - 1].cx - w.cx > gapThreshold) { clusters.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) clusters.push(cur);

  const medianCx = (c: OcrWord[]) => [...c].map(w => w.cx).sort((a, b) => a - b)[Math.floor(c.length / 2)];
  const venue: OcrWord[] = [];
  const teams: OcrWord[][] = [];
  for (const c of clusters) { if (medianCx(c) < venueBoundary) venue.push(...c); else teams.push(c); }

  const home = teams[0] ?? [];
  const away = teams.slice(1).flat();
  return { home, away, venue };
}
