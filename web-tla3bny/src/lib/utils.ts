// Minimal date helpers used by the tla3bny components (a trimmed copy of the
// youthscores web utils — only what this app needs).

export function todayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "in 3d" / "بعد ٣ أيام" until kickoff, or null once it has started. */
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

/** Sort sub-competitions by age_category year ascending (2013 → 2014 → 2015). */
export function sortAges<T extends { age_category?: string | null }>(ages: T[]): T[] {
  return [...ages].sort((a, b) => {
    const ya = parseInt(a.age_category ?? '0', 10) || 0;
    const yb = parseInt(b.age_category ?? '0', 10) || 0;
    return ya - yb;
  });
}

/** Display label for a sub-competition: "Class A · 2014" if named, or "2014". */
export function subCompLabel(a: { name?: string | null; age_category?: string | null }): string {
  return a.name ? `${a.name} · ${a.age_category}` : (a.age_category ?? '—');
}

/**
 * Allow only web-safe schemes for admin/academy-supplied link fields before they
 * go into an <a href>. Blocks `javascript:`/`data:` (stored-XSS vectors). Bare
 * domains are upgraded to https; anything else → undefined so callers drop the href.
 */
export function safeUrl(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  const s = u.trim();
  if (!s) return undefined;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return undefined;
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
