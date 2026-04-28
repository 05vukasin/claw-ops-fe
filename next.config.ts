import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Dev origins — moved from hardcoded to env so no LAN IPs live in source.
// Set ALLOWED_DEV_ORIGINS="192.168.1.1,10.0.0.5" in .env.local for local dev.
// ---------------------------------------------------------------------------
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

// ---------------------------------------------------------------------------
// CSP helpers
// ---------------------------------------------------------------------------

// Resolve the API origin at config time so connect-src is as tight as possible.
// NEXT_PUBLIC_API_ORIGIN must be scheme+host only (e.g. https://viksi.ai).
const apiOrigin = (
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8080"
).replace(/\/+$/, "");
// Derive the WebSocket origin from the API origin (wss:// or ws://)
const wsOrigin = apiOrigin.replace(/^https/, "wss").replace(/^http/, "ws");

// ---------------------------------------------------------------------------
// unsafe-eval note:
// xterm.js v6 uses the WebGL addon (@xterm/addon-webgl) for GPU-accelerated
// terminal rendering. The WebGL shader compilation path in some browsers
// requires eval() internally (via glsl shader string evaluation). Removing
// unsafe-eval causes the WebGL renderer to fail and fall back to canvas,
// which degrades performance significantly on large scrollback buffers.
// Tracked: https://github.com/xtermjs/xterm.js/issues/XXXX
// ---------------------------------------------------------------------------
const cspValue = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `connect-src 'self' ${apiOrigin} ${wsOrigin} blob:`,
  "worker-src 'self' blob:",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "object-src 'none'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .concat(";");

const csp = { key: "Content-Security-Policy", value: cspValue };

// Additional security headers (mirrors claw-ops-chat)
const securityHeaders = [
  csp,
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins,
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => {
    return [
      {
        // Long-lived, content-hashed build assets — safe to cache aggressively.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          ...securityHeaders,
        ],
      },
      {
        // Optimized images — short-lived with SWR.
        source: "/_next/image/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=60, stale-while-revalidate=300",
          },
          ...securityHeaders,
        ],
      },
      {
        // Static public assets (logo, manifest, service workers, fonts).
        source:
          "/:file(favicon\\.ico|manifest\\.json|push-sw\\.js|firebase-messaging-sw\\.js)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, must-revalidate",
          },
          ...securityHeaders,
        ],
      },
      {
        source: "/logo/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
          ...securityHeaders,
        ],
      },
      {
        // Everything else (HTML routes, API responses) — never cache.
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
