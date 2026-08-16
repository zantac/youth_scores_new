// IndexedDB-backed "fetch once, reuse forever" for the OCR model binaries.
//
// The models (~10 MB) are served from a CDN but cached here so a given browser
// downloads them a single time — surviving HTTP-cache eviction and working
// offline afterwards. Keys embed a version tag; bumping the tag transparently
// invalidates old entries and re-downloads.

const DB_NAME = 'youthscores-ocr';
const STORE = 'models';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb();
  try {
    return await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: ArrayBuffer): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export interface FetchProgress {
  key: string;
  loaded: number;
  /** Total bytes if the server sent Content-Length, else 0 (indeterminate). */
  total: number;
}

async function fetchWithProgress(
  url: string,
  key: string,
  onProgress?: (p: FetchProgress) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to download ${key} (${res.status})`);
  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body || !onProgress) return res.arrayBuffer();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ key, loaded, total });
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}

/**
 * Return the model bytes for `key`, downloading from `url` and caching in
 * IndexedDB on first use. If IndexedDB is unavailable (private mode, etc.) it
 * falls back to a plain fetch so the feature still works, just without caching.
 */
export async function getModel(
  url: string,
  key: string,
  onProgress?: (p: FetchProgress) => void,
): Promise<ArrayBuffer> {
  try {
    const cached = await idbGet(key);
    if (cached) return cached;
  } catch {
    /* IndexedDB blocked — fall through to a direct fetch. */
  }
  const buf = await fetchWithProgress(url, key, onProgress);
  try {
    await idbSet(key, buf);
  } catch {
    /* Non-fatal: caching failed, but we still have the bytes. */
  }
  return buf;
}
