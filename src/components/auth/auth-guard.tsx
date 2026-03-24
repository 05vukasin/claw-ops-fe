"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getStoredAuth, clearAuth, updateStoredRefreshToken } from "@/lib/auth";
import { getAccessToken, setAccessToken, clearAccessToken } from "@/lib/apiClient";
import { refreshTokenApi } from "@/lib/api";

const emptySubscribe = () => () => {};

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard
 *
 * Client-side route protection wrapper.
 *
 * On mount:
 *  1. If no stored session -> redirect to /login.
 *  2. If session exists but in-memory access token was lost (page reload) ->
 *     silently restore it via the refresh token before rendering children.
 *  3. If restore fails -> clear stale auth and redirect to /login.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mounted) return;

    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    if (getAccessToken()) {
      setReady(true);
      return;
    }

    const stored = getStoredAuth();
    if (!stored?.refreshToken) {
      router.replace("/login");
      return;
    }

    refreshTokenApi(stored.refreshToken)
      .then(({ accessToken, refreshToken }) => {
        setAccessToken(accessToken);
        updateStoredRefreshToken(refreshToken);
        setReady(true);
      })
      .catch(() => {
        clearAuth();
        clearAccessToken();
        router.replace("/login");
      });
  }, [mounted, router]);

  if (!mounted || !ready) return null;

  return <>{children}</>;
}
