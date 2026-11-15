import type { NextConfig } from 'next';

/**
 * Baseline hardening applied to every response.
 * CSP frame-ancestors allows seamless embedding across Sentinel microservices
 * without triggering brittle X-Frame-Options or CORP blocking in embedded webviews.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer-when-downgrade' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'self' https://hub.sentinelai.studio https://*.sentinelai.studio http://localhost:* http://127.0.0.1:* http://192.168.68.132:*;",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
