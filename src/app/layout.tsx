import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

// Force dynamic rendering so the env var is read at request time, not build time
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ClawOps",
  description: "ClawOps Control Plane",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ClawOps",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Read at request time on the server — NOT baked into the JS bundle
const runtimeApiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:8080";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo/logo.ico" sizes="any" />
        <link rel="icon" href="/logo/logo-with-background.png" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/logo/logo-with-background.png" />
        {/* Inject API origin at runtime so it's never hardcoded in the JS bundle */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__CLAWOPS_API_ORIGIN__=${JSON.stringify(runtimeApiOrigin)};`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
