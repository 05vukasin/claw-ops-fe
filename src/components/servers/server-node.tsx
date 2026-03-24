"use client";

import { useCallback, useRef, useState } from "react";
import type { ServerWithUI } from "@/lib/use-servers";

const NODE_SIZE = 60;
const DRAG_THRESHOLD = 4;

const STATUS_DOT: Record<string, string> = {
  ONLINE: "bg-green-400",
  OFFLINE: "bg-red-400",
  ERROR: "bg-orange-400",
  UNKNOWN: "bg-yellow-400",
};

interface ServerNodeProps {
  server: ServerWithUI;
  isActive: boolean;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onFocus: (id: string) => void;
  onSelect: (id: string) => void;
  zoom: number;
}

export function ServerNode({
  server,
  isActive,
  onMoveEnd,
  onFocus,
  onSelect,
  zoom,
}: ServerNodeProps) {
  const [pos, setPos] = useState({ x: server.x, y: server.y });
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ px: 0, py: 0, ox: 0, oy: 0 });
  const didDrag = useRef(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onFocus(server.id);
      nodeRef.current?.setPointerCapture(e.pointerId);
      origin.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
      didDrag.current = false;
      setDragging(true);
    },
    [pos.x, pos.y, onFocus, server.id],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      // Convert screen-space delta to world-space delta (divide by zoom)
      const dx = (e.clientX - origin.current.px) / zoom;
      const dy = (e.clientY - origin.current.py) / zoom;
      if (!didDrag.current && Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD / zoom) {
        didDrag.current = true;
      }
      if (!didDrag.current) return;
      setPos({ x: origin.current.ox + dx, y: origin.current.oy + dy });
    },
    [dragging, zoom],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      nodeRef.current?.releasePointerCapture(e.pointerId);
      setDragging(false);
      if (didDrag.current) {
        onMoveEnd(server.id, pos.x, pos.y);
      } else {
        onSelect(server.id);
      }
    },
    [dragging, server.id, pos.x, pos.y, onMoveEnd, onSelect],
  );

  const dotColor = STATUS_DOT[server.status] ?? STATUS_DOT.UNKNOWN;

  return (
    <div
      ref={nodeRef}
      data-server-node
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="pointer-events-auto group absolute select-none"
      style={{
        left: pos.x,
        top: pos.y,
        zIndex: isActive ? 1 : 0,
        transform: "translate(-50%, -50%)",
        touchAction: "none",
        cursor: dragging ? "grabbing" : "grab",
      }}
    >
      {/* Circle with server icon */}
      <div
        className={`relative flex items-center justify-center rounded-full border bg-canvas-bg p-2.5 transition-shadow ${
          dragging
            ? "border-canvas-fg/20 shadow-lg"
            : "border-canvas-border shadow-sm group-hover:border-canvas-fg/15 group-hover:shadow-md"
        }`}
        style={{ width: NODE_SIZE, height: NODE_SIZE }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-canvas-muted"
        >
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>

        <span
          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas-bg ${dotColor}`}
        />
      </div>

      <p className="mt-1.5 w-full text-center text-[10px] font-medium leading-tight text-canvas-muted">
        {server.name}
      </p>
    </div>
  );
}
