"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fetchUsersApi, type ManagedUser } from "@/lib/api";

interface UserEmailComboboxProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  invalid?: boolean;
}

let usersCache: Promise<ManagedUser[]> | null = null;

function loadUsers(): Promise<ManagedUser[]> {
  if (usersCache) return usersCache;
  usersCache = fetchUsersApi(0, 100)
    .then((page) => page.content ?? [])
    .catch(() => {
      usersCache = null;
      return [];
    });
  return usersCache;
}

const MAX_SUGGESTIONS = 6;

export function UserEmailCombobox({
  value,
  onChange,
  placeholder = "you@example.com",
  autoFocus,
  invalid,
}: UserEmailComboboxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let stale = false;
    loadUsers().then((list) => {
      if (!stale) setUsers(list);
    });
    return () => {
      stale = true;
    };
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return users.slice(0, MAX_SUGGESTIONS);
    return users
      .filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [users, value]);

  // Hide the dropdown when the typed value already exactly matches the
  // top suggestion's email — nothing useful left to pick.
  const showDropdown =
    open &&
    matches.length > 0 &&
    !(matches.length === 1 && matches[0].email === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Clamp at render time instead of via a setState-in-effect — the next
  // arrow-key tap recovers naturally because the modulo handlers use the
  // current `matches.length`. This just keeps aria-selected consistent
  // when the suggestion list shrinks under the cursor.
  const safeActiveIdx = matches.length > 0 ? Math.min(activeIdx, matches.length - 1) : 0;

  const select = (u: ManagedUser) => {
    onChange(u.email);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === "ArrowDown" && matches.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setActiveIdx((i) => (Math.min(i, matches.length - 1) + 1) % matches.length);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIdx((i) => (Math.min(i, matches.length - 1) - 1 + matches.length) % matches.length);
      e.preventDefault();
    } else if (e.key === "Enter") {
      const pick = matches[safeActiveIdx];
      if (pick) {
        select(pick);
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="email"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showDropdown ? `${listboxId}-${safeActiveIdx}` : undefined}
        className={`w-full rounded-md border bg-canvas-bg px-2 py-1.5 text-[12px] text-canvas-fg placeholder:text-canvas-muted focus:outline-none focus:border-blue-400/60 ${
          invalid ? "border-red-500/50" : "border-canvas-border"
        }`}
      />
      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-canvas-border bg-canvas-bg py-1 shadow-lg"
        >
          {matches.map((u, i) => (
            <button
              key={u.id}
              id={`${listboxId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === safeActiveIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                select(u);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors ${
                i === safeActiveIdx ? "bg-canvas-surface-hover" : ""
              }`}
            >
              <span className="truncate text-[12px] font-medium text-canvas-fg">{u.username}</span>
              <span className="truncate text-[11px] text-canvas-muted">{u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
