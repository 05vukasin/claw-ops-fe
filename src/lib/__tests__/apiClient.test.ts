import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApiUrl, getApiOrigin } from "../apiClient";

// buildApiUrl reads from window.__CLAWOPS_API_ORIGIN__ at call time.
// In jsdom the `window` object is available; we can set the property directly.

declare global {
  interface Window {
    __CLAWOPS_API_ORIGIN__?: string;
  }
}

beforeEach(() => {
  // Reset to a known origin before each test.
  window.__CLAWOPS_API_ORIGIN__ = "https://api.example.com";
});

afterEach(() => {
  delete window.__CLAWOPS_API_ORIGIN__;
});

describe("buildApiUrl", () => {
  it("constructs a fully-qualified URL from a rooted path", () => {
    expect(buildApiUrl("/api/v1/auth/login")).toBe(
      "https://api.example.com/api/v1/auth/login",
    );
  });

  it("adds a leading slash when the path has none", () => {
    expect(buildApiUrl("api/v1/servers")).toBe(
      "https://api.example.com/api/v1/servers",
    );
  });

  it("strips trailing slashes from the origin", () => {
    window.__CLAWOPS_API_ORIGIN__ = "https://api.example.com///";
    expect(buildApiUrl("/api/v1/users")).toBe(
      "https://api.example.com/api/v1/users",
    );
  });

  it("logs a console.error when a double /api/api/ is detected (non-dev env)", () => {
    // Set an origin that already includes /api — simulates NEXT_PUBLIC_API_ORIGIN
    // being set to "https://host/api" instead of the plain origin "https://host".
    window.__CLAWOPS_API_ORIGIN__ = "https://api.example.com/api";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    buildApiUrl("/api/v1/health");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("Double /api detected");
    spy.mockRestore();
  });

  it("returns the correct URL even when double-/api is detected", () => {
    window.__CLAWOPS_API_ORIGIN__ = "https://api.example.com/api";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = buildApiUrl("/api/v1/health");
    expect(url).toBe("https://api.example.com/api/api/v1/health");
    spy.mockRestore();
  });
});

describe("getApiOrigin", () => {
  it("returns the value from window.__CLAWOPS_API_ORIGIN__", () => {
    window.__CLAWOPS_API_ORIGIN__ = "https://viksi.ai";
    expect(getApiOrigin()).toBe("https://viksi.ai");
  });

  it("falls back to localhost:8080 when no origin is configured", () => {
    delete window.__CLAWOPS_API_ORIGIN__;
    // In jsdom the process.env is available; ensure there is no env override.
    const orig = process.env.NEXT_PUBLIC_API_ORIGIN;
    delete process.env.NEXT_PUBLIC_API_ORIGIN;
    expect(getApiOrigin()).toBe("http://localhost:8080");
    if (orig !== undefined) process.env.NEXT_PUBLIC_API_ORIGIN = orig;
  });
});
