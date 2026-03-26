/**
 * Centralized API client with JWT Bearer token support.
 *
 * NEXT_PUBLIC_API_ORIGIN must be scheme + host ONLY — no trailing path:
 *   ✅  https://viksi.ai
 *   ✅  http://localhost:8080
 *   ❌  https://viksi.ai/api   ← path suffix causes double-/api in every URL
 *
 * All call sites pass full backend paths, e.g. "/api/v1/auth/login".
 * Final URL = API_ORIGIN + path  →  https://viksi.ai/api/v1/auth/login
 *
 * Auth flow:
 *  - Access token lives in memory (_accessToken). Set via setAccessToken().
 *  - On every request the Bearer header is added automatically.
 *  - If a 401 is returned, tryRefreshToken() is called once to exchange the
 *    stored refresh token for a new token pair, then the request is retried.
 *  - If refresh also fails the original 401 response is returned so callers
 *    can redirect to /login.
 */

import { getStoredAuth, updateStoredRefreshToken } from "./auth";

declare global {
  interface Window {
    __CLAWOPS_API_ORIGIN__?: string;
  }
}

/**
 * Resolve the API origin at runtime:
 *  - Client: reads window.__CLAWOPS_API_ORIGIN__ (injected by server layout)
 *  - Server: reads the non-public env var (NOT NEXT_PUBLIC_ to avoid bundler inlining)
 *  - Fallback: http://localhost:8080
 */
function resolveApiOrigin(): string {
  if (typeof window !== "undefined" && window.__CLAWOPS_API_ORIGIN__) {
    return window.__CLAWOPS_API_ORIGIN__.replace(/\/+$/, "");
  }
  // Server-side fallback: use a non-NEXT_PUBLIC_ env var to prevent build-time inlining
  // The layout.tsx injects the value for the client, so this only runs during SSR
  const envKey = "NEXT_PUBLIC_API_ORIGIN";
  const serverVal = typeof process !== "undefined" ? process.env[envKey] : undefined;
  return (serverVal ?? "http://localhost:8080").replace(/\/+$/, "");
}

export function getApiOrigin(): string {
  return resolveApiOrigin();
}

/** @deprecated Use getApiOrigin() — kept for imports that reference API_ORIGIN */
export const API_ORIGIN = ""; // placeholder, use getApiOrigin() instead

/**
 * Build a fully-qualified URL from a backend path.
 *
 * @param path  e.g. "/api/v1/auth/login"
 * @returns     e.g. "https://viksi.ai/api/v1/auth/login"
 */
export function buildApiUrl(path: string): string {
  const origin = getApiOrigin();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${origin}${normalizedPath}`;

  if (url.includes("/api/api/")) {
    const msg =
      `[apiClient] Double /api detected in URL: ${url}\n` +
      `NEXT_PUBLIC_API_ORIGIN must be a plain origin with no path suffix.\n` +
      `Current value: "${origin}"`;
    if (process.env.NODE_ENV === "development") {
      throw new Error(msg);
    } else {
      console.error(msg);
    }
  }

  return url;
}

/**
 * Build a WebSocket broker URL for a STOMP terminal session.
 *
 * @param ticket  UUID returned by GET /api/v1/auth/ws-ticket
 * @returns       e.g. "wss://viksi.ai/ws?ticket=<uuid>"
 */
export function buildWsUrl(ticket: string): string {
  const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
  return `${wsBase}/ws?ticket=${encodeURIComponent(ticket)}`;
}

/* ------------------------------------------------------------------ */
/*  In-memory access token                                             */
/* ------------------------------------------------------------------ */

let _accessToken: string | null = null;

export function setAccessToken(token: string): void {
  _accessToken = token;
}

export function clearAccessToken(): void {
  _accessToken = null;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

/* ------------------------------------------------------------------ */
/*  Transparent token refresh                                          */
/* ------------------------------------------------------------------ */

/**
 * Attempt a silent token refresh using the stored refresh token.
 * Uses a raw fetch (not apiFetch) to avoid infinite retry loops.
 * Returns true if a new access token was obtained.
 */
async function tryRefreshToken(): Promise<boolean> {
  const stored = getStoredAuth();
  if (!stored?.refreshToken) return false;
  try {
    const res = await fetch(buildApiUrl("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    _accessToken = data.accessToken;
    updateStoredRefreshToken(data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  apiFetch                                                           */
/* ------------------------------------------------------------------ */

/**
 * Drop-in fetch wrapper that:
 *  - resolves the path against API_ORIGIN
 *  - injects the Bearer access token header
 *  - retries once after a transparent token refresh on 401
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const makeRequest = (token: string | null) =>
    fetch(buildApiUrl(path), {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let res = await makeRequest(_accessToken);

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await makeRequest(_accessToken);
    }
  }

  return res;
}

// Dev assertion: log the resolved origin once (deferred so window is available).
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  setTimeout(() => {
    const o = getApiOrigin();
    console.info(`[apiClient] API_ORIGIN = ${o}`);
  }, 0);
}
