import type { MetadataRoute } from 'next';

const SITE = 'https://youthscores.org';

// Emitted as a static /sitemap.xml at build time (output: 'export').
export const dynamic = 'force-static';

// Indexable, statically-meaningful top-level pages only. The per-entity pages
// (/match, /team, /player, /club, /coach, /competition) are client-rendered
// query-param shells with no per-entity content, so they're intentionally
// omitted until they become /[id] path routes with generateStaticParams.
const ROUTES = [
  '',
  '/competitions',
  '/clubs',
  '/news',
  '/venues',
  '/about',
  '/contact',
  '/privacy-policy',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((path) => ({
    url: `${SITE}${path || '/'}`,
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.6,
  }));
}
