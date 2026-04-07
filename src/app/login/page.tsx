"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { loginApi, meApi, refreshTokenApi, ApiError, type AuthUser } from "@/lib/api";
import {
  setAuth,
  getStoredAuth,
  isAuthenticated,
  updateStoredRefreshToken,
  getUser,
} from "@/lib/auth";
import { setAccessToken } from "@/lib/apiClient";

const emptySubscribe = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Auto-login: if already authenticated redirect immediately.
  // If a refresh token is stored from a previous session, silently exchange
  // it for a new token pair and jump straight into the app.
  useEffect(() => {
    if (!mounted) return;

    if (isAuthenticated()) {
      const dest = getUser()?.role === "USER" ? "/chat" : "/";
      router.replace(dest);
      return;
    }

    const stored = getStoredAuth();
    if (!stored?.refreshToken) return;

    setLoading(true);
    refreshTokenApi(stored.refreshToken)
      .then(async ({ accessToken, refreshToken }) => {
        setAccessToken(accessToken);
        updateStoredRefreshToken(refreshToken);
        const dest = stored.user?.role === "USER" ? "/chat" : "/";
        router.replace(dest);
      })
      .catch(() => {
        // Refresh token expired or invalid — fall through to the sign-in form.
        setLoading(false);
      });
  }, [mounted, router]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError("");
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) {
        setError("Please enter your email and password.");
        return;
      }

      setLoading(true);
      try {
        const { accessToken, refreshToken } = await loginApi(
          trimmedEmail,
          password,
        );
        setAccessToken(accessToken);

        // Fetch user profile from /me endpoint
        const user = await meApi();
        setAuth(user, refreshToken);
        router.replace(user.role === "USER" ? "/chat" : "/");
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Login failed. Please try again.",
        );
        setLoading(false);
      }
    },
    [email, password, router],
  );

  // Don't render while checking stored credentials or redirecting
  if (!mounted || loading) return null;

  const inputClasses =
    "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2.5 text-sm text-canvas-fg placeholder:text-canvas-muted focus:outline-none focus:ring-1 focus:ring-canvas-fg/20";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-md border border-canvas-border bg-canvas-bg p-8 shadow-sm">
        {/* Logo */}
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/openclaw.png"
            alt="ClawOps"
            className="h-14 w-14 object-contain"
            draggable={false}
          />
        </div>

        {/* Title */}
        <h1 className="mt-5 text-center text-lg font-semibold tracking-tight text-canvas-fg">
          Sign in
        </h1>
        <p className="mt-1 text-center text-xs text-canvas-muted">
          ClawOps Workspace
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-xs font-medium text-canvas-muted"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              className={inputClasses}
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-xs font-medium text-canvas-muted"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              className={inputClasses}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-md border border-canvas-border bg-canvas-fg px-4 py-2.5 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90 active:opacity-80"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
