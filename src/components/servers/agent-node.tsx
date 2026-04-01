"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { AgentWithUI } from "@/lib/use-agents";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_SIZE = 50;
const DRAG_THRESHOLD = 4;

// Spring physics — damped harmonic oscillator
const STIFFNESS = 220;   // snappy response
const DAMPING = 18;       // visible jiggle then settles
const SETTLE_V = 0.05;
const SETTLE_D = 0.15;

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface AgentNodeProps {
  agent: AgentWithUI;
  serverX: number;
  serverY: number;
  /** Server's assigned domain (e.g. "clawops.viksi.ai") for building agent URL */
  serverDomain?: string | null;
  onMoveEnd: (serverId: string, name: string, offsetX: number, offsetY: number) => void;
  /** Called every frame with the agent's current animated position (for connector lines) */
  onSpringPos?: (serverId: string, name: string, x: number, y: number) => void;
  /** Called on click (no drag) to open agent dashboard panel */
  onSelect?: (serverId: string, name: string) => void;
  zoom: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentNode({ agent, serverX, serverY, serverDomain, onMoveEnd, onSpringPos, onSelect, zoom }: AgentNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: agent.offsetX, y: agent.offsetY });
  const [dragging, setDragging] = useState(false);

  // Spring state — mutable for performance (updated in rAF, not React state)
  const spring = useRef({ x: serverX + agent.offsetX, y: serverY + agent.offsetY, vx: 0, vy: 0 });
  const target = useRef({ x: serverX + agent.offsetX, y: serverY + agent.offsetY });
  const rafId = useRef(0);
  const isDragging = useRef(false);

  // Visual position — updated from rAF via DOM manipulation for performance
  const visualRef = useRef<HTMLDivElement>(null);

  // Update target whenever server position or offset changes
  const prevTarget = useRef({ sx: serverX, sy: serverY, ox: offset.x, oy: offset.y });

  useEffect(() => {
    const tx = serverX + offset.x;
    const ty = serverY + offset.y;
    target.current = { x: tx, y: ty };

    // If target actually changed and we're not dragging, kick the spring
    const pt = prevTarget.current;
    if (!isDragging.current && (pt.sx !== serverX || pt.sy !== serverY || pt.ox !== offset.x || pt.oy !== offset.y)) {
      prevTarget.current = { sx: serverX, sy: serverY, ox: offset.x, oy: offset.y };
      startSpring();
    }
  });

  const onSpringPosRef = useRef(onSpringPos);
  onSpringPosRef.current = onSpringPos;

  function applyPosition(x: number, y: number) {
    if (visualRef.current) {
      visualRef.current.style.left = `${x}px`;
      visualRef.current.style.top = `${y}px`;
    }
    onSpringPosRef.current?.(agent.serverId, agent.name, x, y);
  }

  function startSpring() {
    if (rafId.current) return; // already running
    let lastTime = 0;

    function tick(time: number) {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.033) : 0.016;
      lastTime = time;

      const s = spring.current;
      const t = target.current;
      const dx = s.x - t.x;
      const dy = s.y - t.y;

      // F = -k*x - d*v
      s.vx += (-STIFFNESS * dx - DAMPING * s.vx) * dt;
      s.vy += (-STIFFNESS * dy - DAMPING * s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const settled =
        Math.abs(s.vx) < SETTLE_V && Math.abs(s.vy) < SETTLE_V &&
        Math.abs(dx) < SETTLE_D && Math.abs(dy) < SETTLE_D;

      if (settled) {
        s.x = t.x; s.y = t.y; s.vx = 0; s.vy = 0;
        applyPosition(s.x, s.y);
        rafId.current = 0;
        return;
      }

      applyPosition(s.x, s.y);
      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);
  }

  // Initialize position on mount
  useEffect(() => {
    applyPosition(spring.current.x, spring.current.y);
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
  }, []);

  // ── Drag handlers ──

  const originDrag = useRef({ clientX: 0, clientY: 0, startX: 0, startY: 0 });
  const didDrag = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      originDrag.current = { clientX: e.clientX, clientY: e.clientY, startX: offset.x, startY: offset.y };
      didDrag.current = false;
      isDragging.current = true;
      setDragging(true);
      // Kill spring during drag
      if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0; }
      spring.current.vx = 0;
      spring.current.vy = 0;
    },
    [offset],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const dx = (e.clientX - originDrag.current.clientX) / zoom;
      const dy = (e.clientY - originDrag.current.clientY) / zoom;
      if (!didDrag.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      didDrag.current = true;

      const newOx = originDrag.current.startX + dx;
      const newOy = originDrag.current.startY + dy;
      setOffset({ x: newOx, y: newOy });

      // Snap spring directly during drag
      const sx = serverX + newOx;
      const sy = serverY + newOy;
      spring.current.x = sx;
      spring.current.y = sy;
      target.current = { x: sx, y: sy };
      applyPosition(sx, sy);
    },
    [zoom, serverX, serverY],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      e.stopPropagation();
      isDragging.current = false;
      setDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (didDrag.current) {
        onMoveEnd(agent.serverId, agent.name, offset.x, offset.y);
      } else if (onSelect) {
        onSelect(agent.serverId, agent.name);
      } else if (serverDomain) {
        // Fallback: open agent URL in new tab
        window.open(`https://${serverDomain}/${agent.name}/`, "_blank", "noopener");
      }
    },
    [agent.serverId, agent.name, offset, onMoveEnd, onSelect, serverDomain],
  );

  const initX = spring.current.x;
  const initY = spring.current.y;

  return (
    <div
        ref={(el) => {
          (nodeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          (visualRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        data-agent-node
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="pointer-events-auto group absolute select-none"
        style={{
          left: initX,
          top: initY,
          zIndex: dragging ? 90 : 2,
          transform: "translate(-50%, -50%)",
          touchAction: "none",
        }}
      >
        <div
          className={`flex items-center justify-center rounded-full border bg-canvas-bg transition-shadow ${
            dragging
              ? "border-canvas-fg/20 shadow-lg"
              : "border-canvas-border shadow-sm group-hover:border-canvas-fg/15 group-hover:shadow-md"
          }`}
          style={{ width: NODE_SIZE, height: NODE_SIZE }}
        >
          <Image
            src="/images/openclaw.png"
            alt={agent.name}
            width={35}
            height={35}
            className="pointer-events-none rounded-full"
            draggable={false}
          />
        </div>
        <p className="mt-1 text-center text-[9px] leading-tight text-canvas-muted" style={{ maxWidth: NODE_SIZE + 16 }}>
          <span className="block truncate">{agent.name}</span>
        </p>
      </div>
  );
}
