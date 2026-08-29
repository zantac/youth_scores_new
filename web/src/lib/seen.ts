// Tracks which news / venue items the user has already seen, so the bottom-bar
// tabs can badge how many were added since their last visit. The first run ever
// seeds the baseline with everything currently present, so a badge only counts
// items added *after* the user first opened the app — not the whole feed.

const KEYS = { news: 'seenNewsIds', venues: 'seenVenueIds' } as const;
export type SeenSection = keyof typeof KEYS;

function read(section: SeenSection): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEYS[section]);
    if (raw == null) return null;
    return new Set(JSON.parse(raw) as string[]);
  } catch { return null; }
}

function write(section: SeenSection, ids: Iterable<string>) {
  try { localStorage.setItem(KEYS[section], JSON.stringify([...ids])); } catch { /* quota / private mode */ }
}

// How many of the current items the user hasn't seen yet. On the very first run
// (no stored baseline) it records everything as seen and reports 0.
export function countUnseen(section: SeenSection, ids: string[]): number {
  const seen = read(section);
  if (seen == null) { write(section, ids); return 0; }
  return ids.filter(id => !seen.has(id)).length;
}

// Mark every current item as seen — called when the user opens the page. Stores
// exactly the current snapshot, so the baseline stays bounded to the feed size.
export function markSeen(section: SeenSection, ids: string[]) {
  write(section, ids);
}
