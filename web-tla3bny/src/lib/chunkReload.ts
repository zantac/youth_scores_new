// Deploy-skew recovery for the static export (output:'export').
//
// Every deploy ships a new build whose JS chunks carry new content hashes and
// whose RSC "flight" payloads (…/index.txt) reference those hashes. A browser tab
// still running the OLD build — or holding a cached index.txt — then fetches
// chunks/payloads that no longer exist on the server. Next's App Router recovers
// from that failed fetch with a HARD navigation, which in a static export dumps
// the user onto the raw …/index.txt served as text/plain. We instead catch the
// chunk-load failure on the still-live page and reload the CURRENT url (never the
// .txt), so the browser pulls the new build's HTML + chunks and the user sees the
// page, not the payload.

const RELOAD_FLAG = 'chunk-reload-at';
// One reload per window. If a chunk STILL fails right after reloading, it is a
// genuine missing asset (not a deploy skew) — stop so we can't loop, and let the
// error boundary show instead.
const RELOAD_COOLDOWN_MS = 10_000;

export function isChunkLoadError(value: unknown): boolean {
  const err = value as { name?: string; message?: string } | null | undefined;
  if (!err) return false;
  const name = err.name ?? '';
  const msg = err.message ?? '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /(Failed to fetch|error loading) dynamically imported module/i.test(msg)
  );
}

// Reload the current page at most once per cooldown. Returns true if a reload was
// triggered. Safe to call from event handlers and error boundaries.
export function reloadForChunkError(): boolean {
  if (typeof window === 'undefined') return false;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
  } catch {
    /* sessionStorage unavailable (private mode / blocked) — best effort */
  }
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.location.reload();
  return true;
}
