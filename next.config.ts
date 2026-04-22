import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "192.168.56.1",
    "172.25.50.205",
    "172.25.32.1",
  ],
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => {
    const csp = {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "connect-src 'self' http: https: ws: wss:",
        "worker-src 'self' blob:",
        "img-src 'self' data: blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "object-src 'none'",
        "frame-ancestors 'none'",
      ].join("; ").concat(";"),
    };
    return [
      {
        // Long-lived, content-hashed build assets — safe to cache aggressively.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          csp,
        ],
      },
      {
        // Optimized images — short-lived with SWR.
        source: "/_next/image/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, stale-while-revalidate=300" },
          csp,
        ],
      },
      {
        // Static public assets (logo, manifest, service workers, fonts).
        source: "/:file(favicon\\.ico|manifest\\.json|push-sw\\.js|firebase-messaging-sw\\.js)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
          csp,
        ],
      },
      {
        source: "/logo/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
          csp,
        ],
      },
      {
        // Everything else (HTML routes, API responses) — never cache.
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          csp,
        ],
      },
    ];
  },
};

export default nextConfig;
