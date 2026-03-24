"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Z_INDEX } from "@/lib/z-index";
import { ServerNode } from "@/components/servers/server-node";
import type { ServerWithUI } from "@/lib/use-servers";

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
  onMoveServer: (id: string, x: number, y: number) => void;
}

export function CanvasStage({ servers, onMoveServer }: CanvasStageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("server");

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
      router.push(`/?server=${id}`);
    },
    [router],
  );

  const handleFocus = useCallback(() => {}, []);

  // Convert a node's world-space move into camera-adjusted coordinates
  const handleMoveEnd = useCallback(
    (id: string, screenX: number, screenY: number) => {
      // screenX/Y are relative to the transformed container, so they're already world coords
      onMoveServer(id, screenX, screenY);
    },
    [onMoveServer],
  );

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
    if (target.closest("[data-server-node]")) return;

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
        {servers.map((s) => (
          <ServerNode
            key={s.id}
            server={s}
            isActive={s.id === activeId}
            onMoveEnd={handleMoveEnd}
            onFocus={handleFocus}
            onSelect={handleSelect}
            zoom={camera.zoom}
          />
        ))}
      </div>
    </div>
  );
}
