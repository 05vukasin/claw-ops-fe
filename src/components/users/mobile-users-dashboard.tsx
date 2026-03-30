"use client";

import type { ManagedUser, PageResponse } from "@/lib/api";
import { MobileUserCard } from "./mobile-user-card";

interface MobileUsersDashboardProps {
  users: ManagedUser[];
  loading: boolean;
  data: PageResponse<ManagedUser> | null;
  page: number;
  onLoadPage: (page: number) => void;
  onCreateUser: () => void;
  onEdit: (user: ManagedUser) => void;
  onPassword: (userId: string) => void;
  onToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
}

export function MobileUsersDashboard({
  users,
  loading,
  data,
  page,
  onLoadPage,
  onCreateUser,
  onEdit,
  onPassword,
  onToggle,
  onDelete,
}: MobileUsersDashboardProps) {
  if (users.length === 0 && !loading) {
    return (
      <div className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center px-4">
        <div className="surface-overlay max-w-md rounded-md px-8 py-10 text-center">
          <h1 className="text-lg font-medium tracking-tight text-canvas-fg">
            User Management
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-canvas-muted">
            No users yet.
          </p>
          <button
            type="button"
            onClick={onCreateUser}
            className="mt-4 rounded-md bg-canvas-fg px-4 py-2 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90"
          >
            + Create User
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] px-3 pb-8 pt-20">
      {/* Title + create button */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-canvas-fg">
          Users
          {data && (
            <span className="ml-2 text-sm font-normal text-canvas-muted">
              ({data.totalElements})
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={onCreateUser}
          className="rounded-md bg-canvas-fg px-3 py-1.5 text-[11px] font-medium text-canvas-bg transition-opacity hover:opacity-90"
        >
          + Create
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && users.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-canvas-border bg-canvas-surface-hover"
            />
          ))}
        </div>
      )}

      {/* User cards */}
      {(!loading || users.length > 0) && (
        <div className="space-y-3">
          {users.map((user) => (
            <MobileUserCard
              key={user.id}
              user={user}
              onEdit={onEdit}
              onPassword={onPassword}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-canvas-muted">
          <button
            type="button"
            onClick={() => onLoadPage(page - 1)}
            disabled={data.first}
            className="rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-30"
          >
            Prev
          </button>
          <span>
            Page {data.number + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() => onLoadPage(page + 1)}
            disabled={data.last}
            className="rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
