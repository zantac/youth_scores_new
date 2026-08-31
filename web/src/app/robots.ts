import type { MetadataRoute } from 'next';

// Canonical host: the apex youthscores.org 301-redirects here, so list www
// directly to avoid a redirect hop on every sitemap URL.
const SITE = 'https://www.youthscores.org';

// Emitted as a static /robots.txt at build time (output: 'export').
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/admin/'] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
