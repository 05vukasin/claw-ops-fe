"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { Modal } from "@/components/ui/modal";
import { MobileUsersDashboard } from "@/components/users";
import { getUser } from "@/lib/auth";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  fetchUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  changePasswordApi,
  ApiError,
  type ManagedUser,
  type UserRole,
  type PageResponse,
} from "@/lib/api";

const PAGE_SIZE = 15;
const ROLES: UserRole[] = ["DEVOPS", "ADMIN"];

export default function UsersPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getUser>>(null);

  // Read user after mount (AuthGuard guarantees auth is ready)
  useEffect(() => {
    const u = getUser();
    setCurrentUser(u);
    if (u && u.role !== "ADMIN") router.replace("/");
  }, [router]);

  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<ManagedUser> | null>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // User modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);

  // Password modal
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdUserId, setPwdUserId] = useState("");

  const showAlert = useCallback((msg: string, type: "success" | "error") => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 4000);
  }, []);

  const loadUsers = useCallback(
    async (p = 0) => {
      setLoading(true);
      try {
        const result = await fetchUsersApi(p, PAGE_SIZE);
        setData(result);
        setPage(p);
      } catch {
        showAlert("Failed to load users", "error");
      } finally {
        setLoading(false);
      }
    },
    [showAlert],
  );

  useEffect(() => {
    if (currentUser?.role === "ADMIN") loadUsers(0);
  }, [loadUsers, currentUser?.role]);

  const handleToggle = useCallback(
    async (user: ManagedUser) => {
      try {
        await updateUserApi(user.id, { enabled: !user.enabled });
        showAlert(user.enabled ? "User disabled" : "User enabled", "success");
        loadUsers(page);
      } catch (err) {
        showAlert(err instanceof ApiError ? err.message : "Failed to update user", "error");
      }
    },
    [showAlert, loadUsers, page],
  );

  const handleDelete = useCallback(
    async (user: ManagedUser) => {
      if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
      try {
        await deleteUserApi(user.id);
        showAlert("User deleted", "success");
        loadUsers(page);
      } catch (err) {
        showAlert(err instanceof ApiError ? err.message : "Failed to delete user", "error");
      }
    },
    [showAlert, loadUsers, page],
  );

  // Don't render if not admin
  if (!currentUser || currentUser.role !== "ADMIN") return null;

  const users = data?.content ?? [];

  if (isMobile) {
    return (
      <>
        {/* Alert (above mobile dashboard) */}
        {alert && (
          <div className="fixed left-3 right-3 top-14 z-50">
            <div
              className={`rounded-md border px-4 py-2.5 text-sm ${
                alert.type === "success"
                  ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400"
                  : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"
              }`}
            >
              {alert.msg}
            </div>
          </div>
        )}

        <MobileUsersDashboard
          users={users}
          loading={loading}
          data={data}
          page={page}
          onLoadPage={loadUsers}
          onCreateUser={() => { setEditUser(null); setModalOpen(true); }}
          onEdit={(u) => { setEditUser(u); setModalOpen(true); }}
          onPassword={(id) => { setPwdUserId(id); setPwdModalOpen(true); }}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />

        <UserModal
          key={editUser?.id ?? "new"}
          open={modalOpen}
          user={editUser}
          onClose={() => { setModalOpen(false); setEditUser(null); }}
          onSaved={(msg) => { setModalOpen(false); setEditUser(null); showAlert(msg, "success"); loadUsers(page); }}
        />
        <PasswordModal
          key={`pwd-${pwdUserId}`}
          open={pwdModalOpen}
          userId={pwdUserId}
          onClose={() => setPwdModalOpen(false)}
          onSaved={() => { setPwdModalOpen(false); showAlert("Password changed", "success"); }}
          onError={(msg) => showAlert(msg, "error")}
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Alert */}
      {alert && (
        <div
          className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${
            alert.type === "success"
              ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400"
              : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"
          }`}
        >
          {alert.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-canvas-fg">User Management</h2>
        <button
          type="button"
          onClick={() => { setEditUser(null); setModalOpen(true); }}
          className="rounded-md border border-canvas-border bg-canvas-fg px-4 py-1.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90"
        >
          + Create User
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-canvas-border bg-canvas-bg">
        {loading && users.length === 0 ? (
          <div className="py-12 text-center text-sm text-canvas-muted">Loading...</div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-sm text-canvas-muted">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-canvas-border">
                  <Th>Username</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-canvas-border last:border-b-0 transition-colors hover:bg-canvas-surface-hover/50"
                  >
                    <td className="px-4 py-3 font-medium text-canvas-fg whitespace-nowrap">{u.username}</td>
                    <td className="px-4 py-3 text-canvas-muted">{u.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          u.role === "ADMIN"
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          u.enabled
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-red-500/10 text-red-500 dark:text-red-400"
                        }`}
                      >
                        {u.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-canvas-muted whitespace-nowrap">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <GhostBtn onClick={() => { setEditUser(u); setModalOpen(true); }}>Edit</GhostBtn>
                        <GhostBtn onClick={() => { setPwdUserId(u.id); setPwdModalOpen(true); }}>Password</GhostBtn>
                        <GhostBtn onClick={() => handleToggle(u)}>
                          {u.enabled ? "Disable" : "Enable"}
                        </GhostBtn>
                        <GhostBtn onClick={() => handleDelete(u)} danger>Delete</GhostBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-canvas-muted">
          <span>{data.totalElements} user{data.totalElements !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <PaginationBtn onClick={() => loadUsers(page - 1)} disabled={data.first}>Prev</PaginationBtn>
            <span>Page {data.number + 1} of {data.totalPages}</span>
            <PaginationBtn onClick={() => loadUsers(page + 1)} disabled={data.last}>Next</PaginationBtn>
          </div>
        </div>
      )}

      {/* User Create/Edit Modal */}
      <UserModal
        key={editUser?.id ?? "new"}
        open={modalOpen}
        user={editUser}
        onClose={() => { setModalOpen(false); setEditUser(null); }}
        onSaved={(msg) => { setModalOpen(false); setEditUser(null); showAlert(msg, "success"); loadUsers(page); }}
      />

      {/* Change Password Modal */}
      <PasswordModal
        key={`pwd-${pwdUserId}`}
        open={pwdModalOpen}
        userId={pwdUserId}
        onClose={() => setPwdModalOpen(false)}
        onSaved={() => { setPwdModalOpen(false); showAlert("Password changed", "success"); }}
        onError={(msg) => showAlert(msg, "error")}
      />
    </div>
  );
}

/* ================================================================== */
/*  User Create/Edit Modal                                             */
/* ================================================================== */

function UserModal({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "DEVOPS");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError("");

      if (!email.trim()) { setError("Email is required."); return; }
      if (!username.trim()) { setError("Username is required."); return; }
      if (!isEdit && !password) { setError("Password is required."); return; }
      if (!isEdit && password.length < 8) { setError("Password must be at least 8 characters."); return; }

      setSubmitting(true);
      try {
        if (isEdit) {
          await updateUserApi(user!.id, { email: email.trim(), username: username.trim(), role });
          onSaved("User updated");
        } else {
          await createUserApi({ email: email.trim(), username: username.trim(), password, role });
          onSaved("User created");
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Operation failed");
      } finally {
        setSubmitting(false);
      }
    },
    [email, username, password, role, isEdit, user, onSaved],
  );

  const inputBase =
    "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 pb-1 pt-6">
          <h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">
            {isEdit ? "Edit User" : "Create User"}
          </h3>
        </div>

        <div className="space-y-3 px-6 pb-2 pt-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputBase} autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Username</label>
            <input type="text" required minLength={3} maxLength={50} value={username} onChange={(e) => setUsername(e.target.value)} className={inputBase} />
          </div>
          {!isEdit && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputBase} pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-canvas-muted transition-colors hover:text-canvas-fg"
                >
                  {showPw ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                </button>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputBase}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-canvas-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-canvas-muted transition-colors hover:text-canvas-fg">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border border-canvas-border bg-canvas-fg px-5 py-2 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Saving..." : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================================================================== */
/*  Change Password Modal                                              */
/* ================================================================== */

function PasswordModal({
  open,
  userId,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError("");
      if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }

      setSubmitting(true);
      try {
        await changePasswordApi(userId, pw);
        onSaved();
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Failed to change password";
        setError(msg);
        onError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [pw, userId, onSaved, onError],
  );

  const inputBase =
    "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 pb-1 pt-6">
          <h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">Change Password</h3>
        </div>

        <div className="space-y-3 px-6 pb-2 pt-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">New Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className={`${inputBase} pr-9`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-canvas-muted transition-colors hover:text-canvas-fg"
              >
                {showPw ? <FiEyeOff size={14} /> : <FiEye size={14} />}
              </button>
            </div>
          </div>
          {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-canvas-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-canvas-muted transition-colors hover:text-canvas-fg">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border border-canvas-border bg-canvas-fg px-5 py-2 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Shared sub-components ── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-canvas-muted">{children}</th>
  );
}

function GhostBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        danger
          ? "text-red-500 hover:bg-red-500/5 dark:text-red-400"
          : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}
    >
      {children}
    </button>
  );
}

function PaginationBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-canvas-border px-3 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
