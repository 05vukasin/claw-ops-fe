"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { GoogleAccountWithUI } from "@/lib/use-google-accounts";

const NODE_SIZE = 44;
const DRAG_THRESHOLD = 4;
const STIFFNESS = 220;
const DAMPING = 18;
const SETTLE_V = 0.05;
const SETTLE_D = 0.15;

interface GoogleNodeProps {
  account: GoogleAccountWithUI;
  serverX: number;
  serverY: number;
  onMoveEnd: (serverId: string, offsetX: number, offsetY: number) => void;
  onSpringPos?: (serverId: string, x: number, y: number) => void;
  onSelect?: (serverId: string) => void;
  zoom: number;
}

export const GoogleNode = memo(function GoogleNode({ account, serverX, serverY, onMoveEnd, onSpringPos, onSelect, zoom }: GoogleNodeProps) {
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
  useEffect(() => { onSpringPosRef.current = onSpringPos; }, [onSpringPos]);

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

  const statusDot = account.authStatus === "authenticated" ? "bg-green-400" : "bg-gray-400";
  const startX = serverX + account.offsetX;
  const startY = serverY + account.offsetY;

  return (
    <div
      ref={(el) => {
        (nodeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        (visualRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      data-google-node
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
        } bg-white dark:bg-[#1a1a2e]`}
        style={{ width: NODE_SIZE, height: NODE_SIZE }}
      >
        {/* Google G logo */}
        <svg width="22" height="22" viewBox="0 0 24 24" className="pointer-events-none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas-bg ${statusDot}`} />
      </div>
      <p className="mt-1 text-center text-[9px] leading-tight text-canvas-muted" style={{ maxWidth: NODE_SIZE + 16 }}>
        <span className="block truncate">{account.accountEmail ?? "Google"}</span>
      </p>
    </div>
  );
});
