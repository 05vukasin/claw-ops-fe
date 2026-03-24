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

export const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8080"
).replace(/\/+$/, ""); // strip any accidental trailing slashes

/**
 * Build a fully-qualified URL from a backend path.
 *
 * @param path  e.g. "/api/v1/auth/login"
 * @returns     e.g. "https://viksi.ai/api/v1/auth/login"
 */
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_ORIGIN}${normalizedPath}`;

  // Guard: double /api/ in the URL is always a misconfiguration.
  if (url.includes("/api/api/")) {
    const msg =
      `[apiClient] Double /api detected in URL: ${url}\n` +
      `NEXT_PUBLIC_API_ORIGIN must be a plain origin with no path suffix.\n` +
      `Current value: "${API_ORIGIN}"`;
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
  const wsBase = API_ORIGIN.replace(/^https/, "wss").replace(/^http/, "ws");
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

// Dev assertion: log the resolved origin and key URLs once on module load.
if (process.env.NODE_ENV === "development") {
  console.info(`[apiClient] API_ORIGIN  = ${API_ORIGIN}`);
  console.info(`[apiClient] Login URL   = ${buildApiUrl("/api/v1/auth/login")}`);
  console.info(
    `[apiClient] WS base     = ${API_ORIGIN.replace(/^https/, "wss").replace(/^http/, "ws")}/ws`,
  );
}
