import type { MetadataRoute } from 'next';

// The public site (gh-pages CNAME). Change here if the canonical host changes.
const SITE = 'https://youthscores.org';

// Emitted as a static /robots.txt at build time (output: 'export').
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/admin/'] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
