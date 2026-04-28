import { describe, it, expect, vi } from "vitest";
import { parseDetection } from "../use-claude-accounts";

// parseDetection is a pure function — no React or browser APIs required.

describe("parseDetection", () => {
  it("returns null when output has fewer than 4 ---CC_SEP--- sections", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseDetection("some output---CC_SEP---auth section");
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toMatch(/expected 4 sections/);
    spy.mockRestore();
  });

  it("returns null and warns when stdout is empty", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseDetection("")).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("returns null when claude binary is not found (NOT_FOUND)", () => {
    const stdout = `NOT_FOUND\n---CC_SEP---\n---CC_SEP---\n0\n---CC_SEP---\n`;
    expect(parseDetection(stdout)).toBeNull();
  });

  it("parses authenticated status from loggedIn JSON", () => {
    const stdout = `claude 1.2.3\n---CC_SEP---\n{"loggedIn": true,"email":"x@y.com"}\n---CC_SEP---\n2.5G\n---CC_SEP---\nproject1\nproject2\n`;
    const result = parseDetection(stdout);
    expect(result).not.toBeNull();
    expect(result?.authStatus).toBe("authenticated");
    expect(result?.version).toBe("claude 1.2.3");
    expect(result?.diskUsage).toBe("2.5G");
    expect(result?.projectCount).toBe(2);
  });

  it("parses authenticated status from compact loggedIn JSON", () => {
    const stdout = `claude 1.5.0\n---CC_SEP---\n{"loggedIn":true}\n---CC_SEP---\n512M\n---CC_SEP---\nproj\n`;
    const result = parseDetection(stdout);
    expect(result?.authStatus).toBe("authenticated");
  });

  it("returns unauthenticated when NOT_AUTHENTICATED is present", () => {
    const stdout = `claude 1.2.3\n---CC_SEP---\nNOT_AUTHENTICATED\n---CC_SEP---\n0\n---CC_SEP---\n`;
    const result = parseDetection(stdout);
    expect(result).not.toBeNull();
    expect(result?.authStatus).toBe("unauthenticated");
    expect(result?.diskUsage).toBeNull();
    expect(result?.projectCount).toBe(0);
  });

  it("returns null diskUsage when disk reports '0'", () => {
    const stdout = `claude 1.0.0\n---CC_SEP---\n{"loggedIn":true}\n---CC_SEP---\n0\n---CC_SEP---\n`;
    const result = parseDetection(stdout);
    expect(result?.diskUsage).toBeNull();
  });

  it("counts only non-empty project lines", () => {
    const stdout = `claude 1.0.0\n---CC_SEP---\n{"loggedIn":true}\n---CC_SEP---\n1G\n---CC_SEP---\n\nprojectA\n\nprojectB\nprojectC\n\n`;
    const result = parseDetection(stdout);
    expect(result?.projectCount).toBe(3);
  });

  it("takes only the first line of the version string", () => {
    const stdout = `claude 2.0.0\nextra line\n---CC_SEP---\n{"loggedIn":true}\n---CC_SEP---\n1G\n---CC_SEP---\n`;
    const result = parseDetection(stdout);
    expect(result?.version).toBe("claude 2.0.0");
  });
});
