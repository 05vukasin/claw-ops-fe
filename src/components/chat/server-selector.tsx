"use client";

import { useEffect, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import type { Server } from "@/lib/api";

interface ServerSelectorProps {
  servers: Server[];
  selectedId: string | null;
  onChange: (serverId: string) => void;
  /** Which edge of the button the dropdown aligns to. Default "left". */
  align?: "left" | "right";
}

const STATUS_DOT: Record<string, string> = {
  ONLINE: "bg-green-500",
  OFFLINE: "bg-red-500",
  ERROR: "bg-orange-500",
  UNKNOWN: "bg-yellow-500",
};

export function ServerSelector({ servers, selectedId, onChange, align = "left" }: ServerSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = servers.find((s) => s.id === selectedId);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Single server — just show the name
  if (servers.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-canvas-muted">
        {selected && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[selected.status] ?? STATUS_DOT.UNKNOWN}`} />}
        <span className="truncate">{selected?.name ?? "No server"}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
      >
        {selected && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[selected.status] ?? STATUS_DOT.UNKNOWN}`} />}
        <span className="max-w-[120px] truncate">{selected?.name ?? "Select server"}</span>
        <FiChevronDown size={11} />
      </button>

      {open && (
        <div className={`absolute top-full z-50 mt-1 min-w-[220px] max-w-[min(280px,calc(100vw-24px))] rounded-lg border border-canvas-border bg-canvas-bg py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {servers.map((server) => (
            <button
              key={server.id}
              type="button"
              onClick={() => { onChange(server.id); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-canvas-surface-hover ${
                server.id === selectedId ? "bg-canvas-surface-hover" : ""
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[server.status] ?? STATUS_DOT.UNKNOWN}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-canvas-fg">{server.name}</p>
                <p className="truncate text-[10px] text-canvas-muted">{server.hostname}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
