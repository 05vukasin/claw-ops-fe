"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Z_INDEX } from "@/lib/z-index";
import { ServerNode } from "@/components/servers/server-node";
import { AgentNode } from "@/components/servers/agent-node";
import type { ServerWithUI } from "@/lib/use-servers";
import type { AgentWithUI } from "@/lib/use-agents";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_SENSITIVITY = 0.001;
const PAN_BUTTON = 0;
const CAMERA_KEY = "openclaw-canvas-camera:v1";

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

function loadCamera(): Camera {
  try {
    const raw = localStorage.getItem(CAMERA_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Camera;
      if (typeof c.x === "number" && typeof c.y === "number" && typeof c.zoom === "number") {
        return c;
      }
    }
  } catch {}
  return { x: 0, y: 0, zoom: 1 };
}

function saveCamera(cam: Camera) {
  try { localStorage.setItem(CAMERA_KEY, JSON.stringify(cam)); } catch {}
}

interface CanvasStageProps {
  servers: ServerWithUI[];
  agents?: AgentWithUI[];
  onMoveServer: (id: string, x: number, y: number) => void;
  onMoveAgent?: (serverId: string, name: string, offsetX: number, offsetY: number) => void;
}

export function CanvasStage({ servers, agents = [], onMoveServer, onMoveAgent }: CanvasStageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Multi-panel: read comma-separated servers param
  const serversParam = searchParams.get("servers") ?? searchParams.get("server") ?? "";
  const openIds = serversParam.split(",").filter(Boolean);
  const activeId = openIds.length > 0 ? openIds[openIds.length - 1] : null;

  const [camera, setCamera] = useState<Camera>(loadCamera);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Persist camera on change (debounced)
  useEffect(() => {
    const t = setTimeout(() => saveCamera(camera), 300);
    return () => clearTimeout(t);
  }, [camera]);

  // Pan state
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, cx: 0, cy: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (id: string) => {
      if (openIds.includes(id)) return;
      const newIds = [...openIds, id];
      router.push(`/?servers=${newIds.join(",")}`);
    },
    [router, openIds],
  );

  const handleFocus = useCallback(() => {}, []);

  // Server lookup for agent positioning
  const serverMap = useMemo(() => new Map(servers.map((s) => [s.id, s])), [servers]);

  // Live server positions (updated during drag for smooth agent following)
  const [livePos, setLivePos] = useState<Record<string, { x: number; y: number }>>({});

  const handleMove = useCallback((id: string, x: number, y: number) => {
    setLivePos((prev) => ({ ...prev, [id]: { x, y } }));
  }, []);

  // Convert a node's world-space move into camera-adjusted coordinates
  const handleMoveEnd = useCallback(
    (id: string, screenX: number, screenY: number) => {
      setLivePos((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      onMoveServer(id, screenX, screenY);
    },
    [onMoveServer],
  );

  // Get live server position (during drag) or stored position
  const getServerPos = useCallback((id: string) => {
    const live = livePos[id];
    if (live) return live;
    const s = serverMap.get(id);
    return s ? { x: s.x, y: s.y } : null;
  }, [livePos, serverMap]);

  // Live agent spring positions for connector lines (updated every animation frame)
  const agentLineRefs = useRef<Map<string, SVGLineElement>>(new Map());

  const handleSpringPos = useCallback((serverId: string, name: string, x: number, y: number) => {
    const key = `${serverId}::${name}`;
    const line = agentLineRefs.current.get(key);
    if (line) {
      line.setAttribute("x2", String(x));
      line.setAttribute("y2", String(y));
    }
  }, []);

  // Update connector x1/y1 when server positions change (live drag or stored)
  useEffect(() => {
    for (const a of agents) {
      const sp = livePos[a.serverId] ?? (() => { const s = serverMap.get(a.serverId); return s ? { x: s.x, y: s.y } : null; })();
      if (!sp) continue;
      const line = agentLineRefs.current.get(`${a.serverId}::${a.name}`);
      if (line) {
        line.setAttribute("x1", String(sp.x));
        line.setAttribute("y1", String(sp.y));
      }
    }
  });

  /* ── Zoom (wheel) ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;

      // Zoom toward cursor position
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * (1 + delta)));
      const scale = newZoom / cam.zoom;

      // Adjust offset so the point under the cursor stays fixed
      const nx = mx - (mx - cam.x) * scale;
      const ny = my - (my - cam.y) * scale;

      setCamera({ x: nx, y: ny, zoom: newZoom });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  /* ── Pan (pointer drag on empty canvas) ── */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only pan on left-click directly on the canvas container (not on nodes)
    if (e.button !== PAN_BUTTON) return;
    const target = e.target as HTMLElement;
    // If the click hit a server node, don't pan
    if (target.closest("[data-server-node]") || target.closest("[data-agent-node]")) return;

    panning.current = true;
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      cx: cameraRef.current.x,
      cy: cameraRef.current.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!panning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setCamera((prev) => ({
      ...prev,
      x: panStart.current.cx + dx,
      y: panStart.current.cy + dy,
    }));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!panning.current) return;
    panning.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    saveCamera(cameraRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      style={{
        zIndex: Z_INDEX.OVERLAY,
        cursor: panning.current ? "grabbing" : "default",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Transformed world container — nodes live here in world coordinates */}
      <div
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          left: 0,
          top: 0,
          // Large enough to never clip nodes
          width: 1,
          height: 1,
        }}
      >
        {/* Connector lines SVG */}
        <svg
          className="pointer-events-none absolute text-canvas-muted"
          style={{ left: 0, top: 0, overflow: "visible" }}
          width="1"
          height="1"
          xmlns="http://www.w3.org/2000/svg"
        >
          {agents.map((a) => {
            const sp = getServerPos(a.serverId);
            if (!sp) return null;
            const key = `${a.serverId}::${a.name}`;
            return (
              <line
                key={`line-${key}`}
                ref={(el) => { if (el) agentLineRefs.current.set(key, el); else agentLineRefs.current.delete(key); }}
                x1={sp.x}
                y1={sp.y}
                x2={sp.x + a.offsetX}
                y2={sp.y + a.offsetY}
                stroke="currentColor"
                strokeOpacity={0.3}
                strokeWidth={3}
                strokeDasharray="0 10"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Agent nodes */}
        {agents.map((a) => {
          const sp = getServerPos(a.serverId);
          if (!sp) return null;
          return (
            <AgentNode
              key={`agent-${a.serverId}::${a.name}`}
              agent={a}
              serverX={sp.x}
              serverY={sp.y}
              onMoveEnd={onMoveAgent ?? (() => {})}
              onSpringPos={handleSpringPos}
              zoom={camera.zoom}
            />
          );
        })}

        {/* Server nodes */}
        {servers.map((s) => (
          <ServerNode
            key={s.id}
            server={s}
            isActive={openIds.includes(s.id)}
            onMoveEnd={handleMoveEnd}
            onMove={handleMove}
            onFocus={handleFocus}
            onSelect={handleSelect}
            zoom={camera.zoom}
          />
        ))}
      </div>
    </div>
  );
}
