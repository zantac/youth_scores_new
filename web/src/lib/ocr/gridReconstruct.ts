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

/** Assign an x to the nearest of the given column centres, returning its key. */
function nearestColumn(x: number, centres: Record<string, number>): string {
  let best = '', bestD = Infinity;
  for (const [k, cx] of Object.entries(centres)) {
    const d = Math.abs(x - cx);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
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

function parseRound(tokens: OcrWord[]): string {
  for (const t of tokens) {
    const s = normalizeDigits(t.text).match(/\d{1,2}/);
    if (s) return s[0];
  }
  return '';
}

// ── main ──────────────────────────────────────────────────────────────────────

export function reconstructFixtures(words: OcrWord[], imageWidth: number): ReconstructResult {
  const warnings: string[] = [];
  const clean = words.filter((w) => w.text.trim().length > 0);
  if (clean.length === 0) return { fixtures: [], warnings: ['No text detected'], orientation: 'logical', columns: {} };

  const rows = clusterRows(clean);
  const header = rows[0];
  const { centres: detected, orientation } = detectColumns(header);

  let centres = detected;
  if (centres.date == null || centres.teams == null) {
    warnings.push('Header row unclear — using fallback column positions');
    centres = fallbackColumns(imageWidth);
  }
  const orient = (s: string) => (orientation === 'visual' ? reverse(s) : s);

  // Column bands we read cells from: order by X for home/away split logic.
  const teamsCentre = centres.teams;
  const dateCentre = centres.date ?? imageWidth * 0.71;
  const venueCentre = centres.venue ?? imageWidth * 0.29;

  const fixtures: RawFixture[] = [];
  let lastRound = '';

  for (const row of rows.slice(1)) {
    // Bucket each word into its nearest known column.
    const byCol: Record<string, OcrWord[]> = {};
    for (const w of row) {
      const col = nearestColumn(w.cx, centres);
      (byCol[col] ??= []).push(w);
    }

    const date = parseDate(byCol.date ?? []);
    const time = parseTime(byCol.time ?? []);
    let round = parseRound([...(byCol.round ?? []), ...(byCol.match ?? [])]);
    if (round) lastRound = round; else round = lastRound; // fill-down merged cell

    // Teams band: split into home (nearer date = higher X) vs away (nearer venue).
    const teamWords = (byCol.teams ?? []).slice().sort((a, b) => b.cx - a.cx); // right→left
    const midX = (venueCentre + dateCentre) / 2 || teamsCentre;
    const homeW = teamWords.filter((w) => w.cx >= midX);
    const awayW = teamWords.filter((w) => w.cx < midX);
    // If the simple midpoint split fails, fall back to the largest X gap.
    let home = homeW, away = awayW;
    if (!home.length || !away.length) {
      const g = largestGap(teamWords);
      home = teamWords.slice(0, g);
      away = teamWords.slice(g);
    }

    const joinRtl = (ws: OcrWord[]) =>
      ws.slice().sort((a, b) => b.cx - a.cx).map((w) => orient(w.text)).join(' ').trim();

    const homeStr = joinRtl(home);
    const awayStr = joinRtl(away);
    const venueStr = joinRtl(byCol.venue ?? []);

    // Skip rows that carry no team text at all (stray header/footer lines).
    if (!homeStr && !awayStr) continue;

    const confs = [date.conf, time.conf, ...home.map((w) => w.conf), ...away.map((w) => w.conf)].filter((c) => c > 0);
    const conf = confs.length ? Math.min(...confs) : 0;

    fixtures.push({ round, date: date.value, time: time.value, home: homeStr, away: awayStr, venue: venueStr, conf, y: row[0].cy });
  }

  if (!fixtures.some((f) => f.round)) warnings.push('Round numbers were not readable (merged cells) — set them manually');
  return { fixtures, warnings, orientation, columns: centres };
}

// Index at which the biggest horizontal gap occurs (words pre-sorted right→left).
function largestGap(words: OcrWord[]): number {
  let idx = Math.ceil(words.length / 2), max = -1;
  for (let i = 1; i < words.length; i++) {
    const gap = Math.abs(words[i - 1].cx - words[i].cx);
    if (gap > max) { max = gap; idx = i; }
  }
  return idx;
}
