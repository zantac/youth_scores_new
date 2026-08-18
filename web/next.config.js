const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // Never cache authenticated admin API responses. They are fetched with a
    // bearer token and would otherwise persist in script-readable Cache Storage
    // past logout. Listed first so it wins over the default "/api/" rule.
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/admin/'),
      handler: 'NetworkOnly',
    },
    ...require('next-pwa/cache'),
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = withPWA(nextConfig);
