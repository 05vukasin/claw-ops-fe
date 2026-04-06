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
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
        {
          key: "Pragma",
          value: "no-cache",
        },
        {
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
        },
      ],
    },
  ],
};

export default nextConfig;
