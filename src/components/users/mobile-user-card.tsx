"use client";

import { useState } from "react";
import { FiChevronDown, FiChevronRight, FiEdit2, FiKey, FiToggleLeft, FiToggleRight, FiTrash2 } from "react-icons/fi";
import type { ManagedUser } from "@/lib/api";

const ROLE_STYLE: Record<string, string> = {
  ADMIN: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  DEVOPS: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface MobileUserCardProps {
  user: ManagedUser;
  onEdit: (user: ManagedUser) => void;
  onPassword: (userId: string) => void;
  onToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
}

export function MobileUserCard({
  user,
  onEdit,
  onPassword,
  onToggle,
  onDelete,
}: MobileUserCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-canvas-border bg-canvas-bg shadow-sm transition-shadow hover:shadow-md">
      {/* Header — tappable */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Status dot */}
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            user.enabled ? "bg-green-500" : "bg-red-500"
          }`}
        />

        {/* Name + email */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-canvas-fg">
            {user.username}
          </p>
          <p className="truncate text-[11px] text-canvas-muted">
            {user.email}
          </p>
        </div>

        {/* Role badge */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_STYLE[user.role] ?? ROLE_STYLE.DEVOPS}`}
        >
          {user.role}
        </span>

        {/* Chevron */}
        {expanded ? (
          <FiChevronDown size={14} className="shrink-0 text-canvas-muted" />
        ) : (
          <FiChevronRight size={14} className="shrink-0 text-canvas-muted" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-canvas-border px-4 py-3 space-y-3">
          {/* Info row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-canvas-muted">
            <span>
              Status:{" "}
              <span className={user.enabled ? "text-green-500" : "text-red-500"}>
                {user.enabled ? "Enabled" : "Disabled"}
              </span>
            </span>
            <span>
              Created: <span className="text-canvas-fg">{formatDate(user.createdAt)}</span>
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <ActionBtn icon={<FiEdit2 size={11} />} label="Edit" onClick={() => onEdit(user)} />
            <ActionBtn icon={<FiKey size={11} />} label="Password" onClick={() => onPassword(user.id)} />
            <ActionBtn
              icon={user.enabled ? <FiToggleRight size={11} /> : <FiToggleLeft size={11} />}
              label={user.enabled ? "Disable" : "Enable"}
              onClick={() => onToggle(user)}
            />
            <ActionBtn
              icon={<FiTrash2 size={11} />}
              label="Delete"
              onClick={() => onDelete(user)}
              danger
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
        danger
          ? "border-red-500/20 text-red-500 hover:bg-red-500/5 dark:text-red-400"
          : "border-canvas-border text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
