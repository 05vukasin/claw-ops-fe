import type { NextConfig } from "next";

// API_ORIGIN must be scheme + host only — no path suffix.
// Reading at config-build time so CSP stays in sync with the env var.
const apiOrigin = (
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8080"
).replace(/\/+$/, "");

// Derive WebSocket origin from HTTP origin.
const wsOrigin = apiOrigin.replace(/^https/, "wss").replace(/^http/, "ws");

/**
 * Content-Security-Policy that covers:
 *  - 'unsafe-eval'   → required by Next.js dev-server webpack (fast-refresh)
 *                       and by @stomp/stompjs internals
 *  - 'unsafe-inline' → required by Next.js inline scripts/styles and Tailwind v4
 *  - worker-src blob → required by @stomp/stompjs heartbeat WebWorker
 *  - connect-src     → API REST + WebSocket endpoints
 *
 * connect-src uses origin-only values (no path suffix).
 * Path-based CSP like https://host/api is invalid per spec and causes
 * browsers to block requests outside that exact subtree.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${apiOrigin} ${wsOrigin}`,
  "worker-src 'self' blob:",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .concat(";");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [
    {
      // Apply CSP to every page route.
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: csp,
        },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
  ],
};

export default nextConfig;
