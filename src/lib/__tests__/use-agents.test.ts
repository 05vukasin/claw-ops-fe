import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @/lib/api so the module can be imported without a real backend.
vi.mock("@/lib/api", () => ({ listFilesApi: vi.fn() }));
// Mock ./use-servers — only the type is needed at runtime.
vi.mock("./use-servers", () => ({}));

import { loadCached } from "../use-agents";

const STORAGE_KEY = "openclaw-agents-ui:v2";

describe("loadCached — localStorage serialization (use-agents)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty array when nothing is stored", () => {
    expect(loadCached()).toEqual([]);
  });

  it("deserializes the new {data, fetchedAt} envelope format", () => {
    const agents = [
      { serverId: "server-1", name: "my-agent", offsetX: 42, offsetY: -15 },
    ];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data: agents, fetchedAt: 1_700_000_000_000 }),
    );
    const result = loadCached();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(agents[0]);
  });

  it("deserializes the legacy plain-array format", () => {
    const agents = [
      { serverId: "server-2", name: "legacy-agent", offsetX: 0, offsetY: 0 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    const result = loadCached();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("legacy-agent");
  });

  it("filters out entries that are missing serverId", () => {
    const agents = [
      { name: "no-server-id", offsetX: 10, offsetY: 20 }, // invalid — no serverId
      { serverId: "s1", name: "valid-agent", offsetX: 10, offsetY: 20 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    const result = loadCached();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("valid-agent");
  });

  it("filters out entries that are missing offsetX", () => {
    const agents = [
      { serverId: "s1", name: "no-offset" }, // invalid — no offsetX
      { serverId: "s2", name: "has-offset", offsetX: 5, offsetY: 5 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    expect(loadCached()).toHaveLength(1);
  });

  it("filters out entries that are missing name", () => {
    const agents = [
      { serverId: "s1", offsetX: 5, offsetY: 5 }, // invalid — no name
      { serverId: "s2", name: "ok", offsetX: 5, offsetY: 5 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    expect(loadCached()).toHaveLength(1);
  });

  it("returns empty array on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{");
    expect(loadCached()).toEqual([]);
  });

  it("returns empty array when stored value is a non-array object without data key", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unexpected: true }));
    expect(loadCached()).toEqual([]);
  });

  it("stores multiple agents and preserves all valid entries", () => {
    const agents = [
      { serverId: "s1", name: "agent-a", offsetX: 10, offsetY: 20 },
      { serverId: "s1", name: "agent-b", offsetX: -30, offsetY: 40 },
      { serverId: "s2", name: "agent-c", offsetX: 0, offsetY: 0 },
    ];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data: agents, fetchedAt: Date.now() }),
    );
    expect(loadCached()).toHaveLength(3);
  });
});
