"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { CodexAccountWithUI } from "@/lib/use-codex-accounts";

const NODE_SIZE = 44;
const DRAG_THRESHOLD = 4;
const STIFFNESS = 220;
const DAMPING = 18;
const SETTLE_V = 0.05;
const SETTLE_D = 0.15;

interface CodexNodeProps {
  account: CodexAccountWithUI;
  serverX: number;
  serverY: number;
  onMoveEnd: (serverId: string, offsetX: number, offsetY: number) => void;
  onSpringPos?: (serverId: string, x: number, y: number) => void;
  onSelect?: (serverId: string) => void;
  zoom: number;
}

export function CodexNode({ account, serverX, serverY, onMoveEnd, onSpringPos, onSelect, zoom }: CodexNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: account.offsetX, y: account.offsetY });
  const [dragging, setDragging] = useState(false);

  const spring = useRef({ x: serverX + account.offsetX, y: serverY + account.offsetY, vx: 0, vy: 0 });
  const target = useRef({ x: serverX + account.offsetX, y: serverY + account.offsetY });
  const rafId = useRef(0);
  const isDragging = useRef(false);
  const visualRef = useRef<HTMLDivElement>(null);
  const prevTarget = useRef({ sx: serverX, sy: serverY, ox: offset.x, oy: offset.y });

  const onSpringPosRef = useRef(onSpringPos);
  useEffect(() => {
    onSpringPosRef.current = onSpringPos;
  }, [onSpringPos]);

  const applyPosition = useCallback((x: number, y: number) => {
    if (visualRef.current) {
      visualRef.current.style.left = `${x}px`;
      visualRef.current.style.top = `${y}px`;
    }
    onSpringPosRef.current?.(account.serverId, x, y);
  }, [account.serverId]);

  function startSpring() {
    if (rafId.current) return;
    let lastTime = 0;

    function tick(time: number) {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.033) : 0.016;
      lastTime = time;

      const s = spring.current;
      const t = target.current;
      const dx = s.x - t.x;
      const dy = s.y - t.y;

      s.vx += (-STIFFNESS * dx - DAMPING * s.vx) * dt;
      s.vy += (-STIFFNESS * dy - DAMPING * s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const settled =
        Math.abs(s.vx) < SETTLE_V && Math.abs(s.vy) < SETTLE_V &&
        Math.abs(dx) < SETTLE_D && Math.abs(dy) < SETTLE_D;

      if (settled) {
        s.x = t.x;
        s.y = t.y;
        s.vx = 0;
        s.vy = 0;
        applyPosition(s.x, s.y);
        rafId.current = 0;
        return;
      }

      applyPosition(s.x, s.y);
      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    const tx = serverX + offset.x;
    const ty = serverY + offset.y;
    target.current = { x: tx, y: ty };

    const pt = prevTarget.current;
    if (!isDragging.current && (pt.sx !== serverX || pt.sy !== serverY || pt.ox !== offset.x || pt.oy !== offset.y)) {
      prevTarget.current = { sx: serverX, sy: serverY, ox: offset.x, oy: offset.y };
      startSpring();
    }
  });

  useEffect(() => {
    applyPosition(spring.current.x, spring.current.y);
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
  }, [applyPosition]);

  const originDrag = useRef({ clientX: 0, clientY: 0, startX: 0, startY: 0 });
  const didDrag = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    originDrag.current = { clientX: e.clientX, clientY: e.clientY, startX: offset.x, startY: offset.y };
    didDrag.current = false;
    isDragging.current = true;
    setDragging(true);
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0; }
    spring.current.vx = 0;
    spring.current.vy = 0;
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = (e.clientX - originDrag.current.clientX) / zoom;
    const dy = (e.clientY - originDrag.current.clientY) / zoom;
    if (!didDrag.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    didDrag.current = true;

    const newOx = originDrag.current.startX + dx;
    const newOy = originDrag.current.startY + dy;
    setOffset({ x: newOx, y: newOy });

    const sx = serverX + newOx;
    const sy = serverY + newOy;
    spring.current.x = sx;
    spring.current.y = sy;
    target.current = { x: sx, y: sy };
    applyPosition(sx, sy);
  }, [applyPosition, zoom, serverX, serverY]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    isDragging.current = false;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (didDrag.current) {
      onMoveEnd(account.serverId, offset.x, offset.y);
    } else if (onSelect) {
      onSelect(account.serverId);
    }
  }, [account.serverId, offset, onMoveEnd, onSelect]);

  const statusDot = account.authStatus === "authenticated"
    ? "bg-green-400"
    : account.authStatus === "unauthenticated"
      ? "bg-orange-400"
      : "bg-gray-400";

  const startX = serverX + account.offsetX;
  const startY = serverY + account.offsetY;

  return (
    <div
      ref={(el) => {
        (nodeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        (visualRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      data-codex-node
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="pointer-events-auto group absolute select-none"
      style={{ left: startX, top: startY, zIndex: dragging ? 90 : 2, transform: "translate(-50%, -50%)", touchAction: "none" }}
    >
      <div
        className={`relative flex items-center justify-center rounded-full border transition-shadow ${
          dragging
            ? "border-white/20 shadow-lg"
            : "border-white/10 shadow-sm group-hover:border-white/20 group-hover:shadow-md"
        } bg-white`}
        style={{ width: NODE_SIZE, height: NODE_SIZE }}
      >
        <Image src="/images/codex.png" alt="Codex" width={36} height={36} className="pointer-events-none rounded-full" />
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas-bg ${statusDot}`} />
      </div>
      <p className="mt-1 text-center text-[9px] leading-tight text-canvas-muted" style={{ maxWidth: NODE_SIZE + 16 }}>
        <span className="block truncate">{account.version ?? "Codex"}</span>
      </p>
    </div>
  );
}
