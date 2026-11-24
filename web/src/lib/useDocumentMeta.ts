'use client';
import { useEffect } from 'react';

const SUFFIX = ' | Youth Scores';

/**
 * Set the tab title + meta description from the loaded entity.
 *
 * Entity path routes (/player/<id>/ …) are served from one static shell. Flask
 * injects the real <title>/description into the HTML, but the shell's RSC payload
 * still carries the generic build-time title ("لاعب | Youth Scores"). Hydration
 * swaps that back in, so Googlebot, which renders JS, used to see the same title on
 * every player page and treat them as near-duplicates. Setting the real values once
 * the data is in fixes the rendered page. Does nothing until `title` is non-empty.
 */
export function useDocumentMeta(title?: string | null, description?: string | null) {
  useEffect(() => {
    const t = (title ?? '').trim();
    if (!t) return;
    document.title = t + SUFFIX;
    const d = (description ?? '').trim();
    if (!d) return;
    let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!el) {
      el = document.createElement('meta');
      el.name = 'description';
      document.head.appendChild(el);
    }
    el.content = d;
  }, [title, description]);
}
