'use client';
import { useEffect, useRef } from 'react';
import { mediaUrl } from '@/lib/tla3bnyApi';

export interface PrintCardItem {
  key: string | number;
  photoPath: string | null;
  name: string | null;
  /** A small line under the name, e.g. "Winger · #10". */
  meta?: string | null;
}

// One player on the printable (Save-as-PDF) sheet. Explicit light colours: the
// app is dark-themed, but the print sheet is black-on-white.
function PrintCard({ item }: { item: PrintCardItem }) {
  const url = mediaUrl(item.photoPath);
  return (
    <div className="text-center border border-black/20 rounded p-1 break-inside-avoid">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full aspect-[3/4] object-cover object-top rounded" />
      ) : (
        <div className="w-full aspect-[3/4] rounded bg-gray-200 grid place-items-center text-gray-500 text-base font-bold">
          {(item.name ?? '?').trim().slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="text-[10px] font-bold leading-tight mt-0.5">{item.name}</div>
      {item.meta && <div className="text-[9px] text-gray-600">{item.meta}</div>}
    </div>
  );
}

/**
 * The off-screen sheet the print CSS (`@media print` in globals.css) reveals:
 * it keys off the `#print-cards` id and hides everything else. Mount this ON
 * DEMAND only while printing (never keep it resident) so the full-size photos
 * are decoded just for the print window and released afterwards — keeping them
 * always mounted used to exhaust the per-tab image memory on mobile Safari /
 * in-app WebViews and blank the page. On mount it waits for every photo to
 * decode, then opens the print dialog; the parent should unmount it again on
 * `afterprint`.
 */
export default function PrintableCards({ title, subtitle, items }: {
  title: string; subtitle?: string | null; items: PrintCardItem[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const root = rootRef.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll('img'));
    // Resolve (never reject) per image so one broken photo can't block the PDF.
    const ready = Promise.all(imgs.map(img =>
      img.complete
        ? img.decode().catch(() => {})
        : new Promise<void>(res => {
            img.onload = () => img.decode().then(() => res()).catch(() => res());
            img.onerror = () => res();
          })
    ));
    // Backstop: a hung network image must never block the dialog forever.
    const timeout = new Promise<void>(res => setTimeout(res, 4000));
    Promise.race([ready, timeout]).then(() => {
      if (!cancelled) window.print();
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <div id="print-cards" ref={rootRef} className="absolute -left-[10000px] top-0 w-full bg-white text-black p-4">
      <h1 className="text-lg font-black text-center">{title}</h1>
      {subtitle && <p className="text-center text-xs text-gray-600 mb-4">{subtitle}</p>}
      <div className="grid grid-cols-5 gap-2">
        {items.map(it => <PrintCard key={it.key} item={it} />)}
      </div>
    </div>
  );
}
