# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ClawOps is a server management platform frontend for deploying and managing self-hosted AI agents and general server infrastructure. The main screen is an open canvas where server nodes and their connected AI agents are visualized as draggable, interactive nodes. Deployment scripts, SSL provisioning, health monitoring, SSH terminals, SFTP file browsing, domain management, user management, and audit logging are all accessible through the UI. The actual deployment scripts live in the backend database — this frontend is the control plane that makes managing servers and agent deployments easier.

Built with Next.js 16 (App Router), React 19, TypeScript. Communicates with a Java/Spring backend API.

## Commands

```bash
npm run dev          # Dev server on port 3000
npm run build        # Production build (standalone output)
npm start            # Start production server
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format all files
npm run format:check # Check formatting
```

No test framework is configured.

## Environment Setup

Copy `.env.local.example` to `.env.local`. The key variable is `NEXT_PUBLIC_API_ORIGIN` — must be scheme+host only (e.g. `https://viksi.ai`, not `https://viksi.ai/api`). This value is injected at runtime via `window.__CLAWOPS_API_ORIGIN__` in the root layout. `NEXT_PUBLIC_*` vars are baked at startup — requires restart after changes. Cross-origin cookie limitation: dev server on `localhost:3000` hitting production backend won't carry `JSESSIONID` due to `SameSite=Lax`.

## Architecture

### Routing

Next.js App Router with file-based routing in `src/app/`. Protected routes live under the `(main)` route group which wraps everything in `<AuthGuard>`. The login page at `/login` is outside this group.

**Routes:**
- `/login` — Authentication (no guard)
- `/` — Main canvas dashboard (servers + agents)
- `/domains` — Domain management and DNS assignments
- `/logs` — Audit logs (admin only)
- `/scripts` — Deployment script library
- `/users` — User management (admin only)
- `/zip-generator` — Agent ZIP package creator

### Auth Flow

- JWT Bearer tokens with automatic silent refresh on 401 responses
- Access token stored **in-memory only** (module variable in `apiClient.ts`) — lost on page refresh by design
- Refresh token + user profile stored in localStorage (`openclaw-auth:v1`)
- `AuthGuard` (`src/components/auth/auth-guard.tsx`) protects all `(main)` routes — if access token is gone but refresh token exists, it silently re-authenticates before rendering
- Login flow: `POST /api/v1/auth/login` → get tokens → `GET /api/v1/auth/me` → store user → redirect to `/`
- All API calls **must** go through `apiFetch()` in `src/lib/apiClient.ts` which injects Bearer token and handles transparent refresh. Never use raw `fetch()`.

### API Layer

- **`src/lib/apiClient.ts`** — HTTP client wrapper. `apiFetch(path, init)` resolves path against API origin, injects Bearer token, auto-retries on 401 after refresh. Also exports `buildWsUrl(ticket)` for WebSocket connections. Throws `ApiError` (extends Error with `status` property) on HTTP errors.
- **`src/lib/api.ts`** (~1070 lines) — All backend endpoint functions organized by domain. This is the single source of truth for every API call the frontend makes.

**API origin resolution:** `window.__CLAWOPS_API_ORIGIN__` (client-side) or `NEXT_PUBLIC_API_ORIGIN` env var (server-side), fallback `http://localhost:8080`. The client has built-in detection to prevent double `/api/api/` in URLs.

### API Endpoints Reference

**Auth:**
- `POST /api/v1/auth/login` — Login with email/password → TokenResponse
- `POST /api/v1/auth/refresh` — Refresh access token
- `POST /api/v1/auth/logout` — Invalidate refresh token
- `GET /api/v1/auth/me` — Current user profile

**Servers:**
- `GET /api/v1/servers?page=&size=` — List servers (paginated)
- `POST /api/v1/servers` — Create server
- `PATCH /api/v1/servers/{id}` — Update server
- `DELETE /api/v1/servers/{id}` — Delete server
- `POST /api/v1/servers/{id}/test-connection` — Test SSH connectivity
- `GET /api/v1/servers/{id}/ssh/session-token` — Get WebSocket session ticket

**SSH & SFTP:**
- `POST /api/v1/servers/{id}/ssh/command` — Execute command `{ command, timeoutSeconds? }`
- `GET /api/v1/servers/{id}/sftp/ls?path=` — List directory contents
- `WS /ws/terminal?token=TOKEN&cols=&rows=` — Interactive SSH terminal via WebSocket

**Monitoring & Health:**
- `GET /api/v1/monitoring/health` — Fleet-wide health summary
- `GET /api/v1/monitoring/health/{id}` — Single server health
- `GET /api/v1/monitoring/metrics/{id}/latest` — Latest metrics
- `GET /api/v1/monitoring/metrics/{id}?type=&from=&to=` — Historical metrics time series
- `POST /api/v1/monitoring/check/{id}` — Trigger manual health check
- `GET/PATCH /api/v1/monitoring/profiles/{id}` — Monitoring profiles
- `GET/POST /api/v1/monitoring/maintenance` — Maintenance windows

**Scripts & Deployment:**
- `GET /api/v1/scripts?page=&size=` — List deployment scripts
- `GET /api/v1/servers/{id}/deployment-jobs?limit=` — Server job history
- `GET /api/v1/deployment-jobs/{id}` — Job detail with logs
- `POST /api/v1/deployment-jobs` — Create job `{ scriptId, serverId, interactive }`
- `POST /api/v1/deployment-jobs/{id}/stop` — Stop running job
- `POST /api/v1/deployment-jobs/{id}/cancel` — Cancel pending job
- `GET /api/v1/deployment-jobs/{id}/terminal-token` — Get terminal token for interactive job
- `WS /ws/terminal?token=TOKEN&mode=deployment&jobId=ID` — Interactive deployment terminal

**Domains & SSL:**
- `GET /api/v1/domain-assignments?page=&size=` — List domain assignments
- `POST /api/v1/domain-assignments/custom` — Create custom DNS record
- `POST /api/v1/domain-assignments/{id}/verify` — Verify DNS propagation
- `DELETE /api/v1/domain-assignments/{id}` — Remove assignment
- `GET /api/v1/zones` — List DNS zones
- `POST /api/v1/zones/{id}/set-default` — Set default zone
- `GET /api/v1/ssl-certificates/server/{id}` — SSL cert for server
- `POST /api/v1/ssl-certificates/{id}/provision` — Provision SSL
- `GET /api/v1/ssl-jobs/{id}` — SSL job status

**Users & Audit (admin):**
- `GET /api/v1/users?page=&size=` — List users
- `POST /api/v1/users` — Create user `{ email, username, password, role }`
- `PATCH /api/v1/users/{id}` — Update user
- `DELETE /api/v1/users/{id}` — Delete user
- `POST /api/v1/users/{id}/change-password` — Change password
- `GET /api/v1/audit-logs?page=&size=&filters=` — Filtered audit logs

**Secrets:**
- `POST /api/v1/secrets` — Store credential `{ name, type, value }` → `{ id }`
- `DELETE /api/v1/secrets/{id}` — Delete credential

### State Management

No Redux/Zustand. Uses `useSyncExternalStore` with module-level singleton stores (external to React):

- **`src/lib/use-servers.ts`** — `useServers()` hook returns `{ servers, refresh, moveServer, removeServer }`. Fetches from API on mount, merges with saved canvas positions from localStorage (`openclaw-servers-ui:v1`). New servers are scattered in a grid pattern around viewport center with random jitter.
- **`src/lib/use-agents.ts`** — `useAgents(servers)` hook returns `{ agents, refresh, moveAgent }`. Discovers agents by listing each server's `/root/openclaw-agents/` directory via SFTP. Assigns positions in a non-overlapping ring around parent server. Cached in localStorage (`openclaw-agents-ui:v2`).
- **Canvas camera** — `{ x, y, zoom }` persisted to `openclaw-canvas-camera:v1`, debounced 300ms.
- **Auth state** — `{ user, refreshToken }` in `openclaw-auth:v1`.
- **Agent panel positions** — Individual panels saved as `openclaw-agent-panel-{serverId}::{agentName}-{x|y|w}`.

### The Canvas (Main Page)

The heart of the app. `src/components/canvas/canvas-stage.tsx` renders an interactive SVG canvas:

- **Server nodes** — Circles colored by status (ONLINE=green, OFFLINE=red, ERROR=orange, UNKNOWN=yellow). Draggable. Click opens server dashboard panel.
- **Agent nodes** — Smaller nodes around each server with **spring physics animation** (STIFFNESS=220, DAMPING=18). Connected to parent server by dashed SVG lines. Click opens agent dashboard or web UI.
- **Pan** — Left-click drag on empty canvas
- **Zoom** — Mouse wheel, cursor-anchored (0.15x min, 3x max)
- **Drag math** — World-space delta = screen-space delta ÷ zoom (consistent feel at any zoom)
- **URL state** — Open panels tracked in URL params: `?servers=id1,id2&agents=serverId::agentName`

### Workspace Panel System

`src/app/(main)/workspace-panel.tsx` manages all open dashboard panels. Reads server/agent IDs from URL params. Each panel is:

- **Draggable** by header bar
- **Resizable** from left/right edges (min 340px, max 1400px)
- **Stackable** with z-index focus tracking (clicking brings to front)
- **Persistent** — positions saved to localStorage per server/agent

### Server Dashboard Panel

`src/components/servers/server-dashboard-panel.tsx` — The main panel when you click a server node. Contains collapsible sections:

1. **Header** — Server name, status badge, environment, edit/delete actions
2. **Terminal** (`terminal-section.tsx`) — Interactive SSH via xterm.js + WebSocket. Supports Ctrl+C (copy or SIGINT), right-click paste, OSC 7 directory tracking (`PROMPT_COMMAND` emits `\033]7;file://host/path\033\\`). Exposes imperative handle for `sendCommand()`.
3. **File Browser** (`file-browser.tsx`) — SFTP directory listing with breadcrumb navigation. Directories sorted first, then alphabetical. Exposes imperative `navigateTo(path)` handle.
4. **Health** (`health-section.tsx`) — CPU/Memory/Disk/Swap bars, load average, uptime, process count. Canvas-based mini chart for historical metrics (1h/6h/24h/7d). Status badges: HEALTHY, WARNING, CRITICAL, UNREACHABLE, UNKNOWN, MAINTENANCE.
5. **Scripts** (`scripts-section.tsx`) — Searchable script library (types: GENERAL, INSTALL, REMOVE, UPDATE, MAINTENANCE). Job history with status tracking. Interactive script execution via xterm.js popup terminal. Auto-polls job list every 3s while jobs are active.

### Agent Dashboard Panel

`src/components/agents/agent-dashboard-panel.tsx` — Panel for AI agents connected to a server:

1. **Overview** — Model name, channels (Slack/Telegram), thinking mode, streaming, uptime
2. **Token Usage** (`agent-tokens-section.tsx`) — Input/output tokens, cache hits, estimated cost
3. **Logs** (`agent-logs-section.tsx`) — Docker container logs via `docker logs --tail 100`
4. **Memory** (`agent-memory-section.tsx`) — Agent memory files from `/workspace/memory/`
5. **Actions** — Restart agent (`docker compose restart`, 60s timeout), open web UI (`https://{serverDomain}/{agentName}/`)

Agent data fetched via SSH commands: `docker inspect` for container state, reads `/root/openclaw-agents/{agentName}/config/openclaw.json` for config.

### Terminal Implementation

xterm.js v6 with WebSocket transport (not STOMP for raw terminal — STOMP is used for deployment jobs):
- WebGL addon for GPU-accelerated rendering
- JetBrains Mono font, 13px, 1.35 line height
- 10,000 line scrollback buffer
- Clickable URLs via WebLinksAddon
- Session token obtained from `GET /api/v1/servers/{id}/ssh/session-token`, then WebSocket opened at `/ws/terminal?token=TOKEN&cols=&rows=`

WebSocket message format:
```
Client → Server: { type: "INPUT", data: "command\r" }
Server → Client: { type: "OUTPUT" | "ERROR" | "CLOSED", data: "..." }
```

### Fleet Summary Bar

`src/components/servers/fleet-summary-bar.tsx` — Horizontal bar showing fleet-wide stats: total servers, online/offline/error counts, server status breakdown. Visible at top of canvas.

### Responsive Design

Desktop shows the interactive canvas; mobile (≤767px via `useIsMobile()` hook using `useSyncExternalStore` + matchMedia) shows card-based dashboards. Separate mobile components exist for servers, users, logs, and scripts (e.g. `mobile-server-dashboard.tsx`, `mobile-server-card.tsx`).

### Styling

Tailwind CSS v4 with CSS custom properties for theming defined in `globals.css`:

```
Light: --canvas-bg:#fff --canvas-fg:#0a0a0a --canvas-border:rgba(0,0,0,0.08) --canvas-surface:rgba(255,255,255,0.473)
Dark:  --canvas-bg:#0a0a0a --canvas-fg:#fafafa --canvas-border:rgba(255,255,255,0.08) --canvas-surface:rgba(10,10,10,0.72)
```

Dark/light mode via `next-themes` applying `.dark` class to `<html>`.

Custom animations: `animate-modal-in/out` (scale+fade), `animate-collapse` (grid-rows+opacity for collapsible sections), `animate-fade-slide-in` (slide up+fade).

### Z-Index Layers (`src/lib/z-index.ts`)

```
CANVAS=0 → OVERLAY=10 → FLOATING=20 → HEADER=30 → DROPDOWN=40 → MODAL=50 → TOAST=60
```

### Path Alias

`@/*` maps to `./src/*` (configured in `tsconfig.json`).

### GitHub Node System

Canvas node for GitHub CLI integration per server:
- **`src/lib/use-github-accounts.ts`** — Detects `gh auth status` on each ONLINE server via SSH. Singleton store with `useSyncExternalStore`. Cached in `openclaw-github-ui:v1`.
- **`src/components/servers/github-node.tsx`** — 44px black circle with white `<FiGithub>` icon. Spring physics, drag, click-to-open. Status dot: green=authenticated, gray=not.
- **`src/components/servers/github-dashboard-panel.tsx`** — Draggable panel with account info, token management (update/test/logout), git config editing, quick actions.
- URL param: `?github=github::serverId`

### Claude Code Node System

Canvas node for Claude Code CLI per server:
- **`src/lib/use-claude-accounts.ts`** — Detects `claude --version` and `claude auth status` on ONLINE servers. Cached in `openclaw-claude-ui:v1`.
- **`src/components/servers/claude-node.tsx`** — 44px orange circle (`#C15F3C`) with white Claude logo. Same spring physics pattern.
- **`src/components/servers/claude-dashboard-panel.tsx`** — Version, auth status, disk usage, projects list. Login opens interactive `ClaudeCodeOverlay`. Update via npm.
- URL param: `?claude=claude::serverId`

### Notification System

Firebase Cloud Messaging + VAPID Web Push:
- **`src/components/settings/settings-overlay.tsx`** — Notification setup flow: tries VAPID first, falls back to FCM. Registers service worker, gets FCM token, subscribes with backend, registers device.
- **`public/push-sw.js`** — Universal push service worker handling FCM notification, FCM data, and VAPID payload formats. Shows system notifications with ClawOps branding.
- **`public/firebase-messaging-sw.js`** — Delegates to `push-sw.js` for backward compatibility.
- **`src/app/(main)/notifications/page.tsx`** — Admin page for managing providers, devices, and sending test notifications.
- Foreground messages handled via `onMessage()` from Firebase messaging SDK.

### Deploy Popup (Server-Side Execution)

`src/components/servers/deploy-popup.tsx` — Runs `/root/deploy/deploy.sh` via `executeCommandApi` (HTTP POST, not WebSocket). The command runs server-side to completion regardless of client connection state. Popup shows spinner while running, then full log output on success/failure with retry button.

### Mobile Terminal

- **`src/components/servers/mobile-terminal-view.tsx`** — Fullscreen terminal for mobile with `useVisualViewport` for keyboard handling, quick-action toolbar (Tab, arrows, Ctrl keys).
- **`src/components/servers/mobile-persistent-terminal.tsx`** — Same as above but with persistent sessions that survive browser close.
- Font: 10px, lineHeight 1.25, letterSpacing 0.2 (optimized for ~50-55 columns on 375px screens).

## Key Conventions

- Always use `logo.png` as the primary logo, not `logo-light.png`
- Build output is standalone (`output: "standalone"` in `next.config.ts`)
- `apiFetch()` must be used for all API calls — never raw `fetch()`
- Barrel exports via `index.ts` in each component directory
- Imperative handles (`forwardRef` + `useImperativeHandle`) used for terminal and file browser components to allow parent control
- Server auth types: `"PASSWORD"` or `"PRIVATE_KEY"`. Credentials stored via secrets API, referenced by ID.
- Deployment script types: `GENERAL`, `INSTALL`, `REMOVE`, `UPDATE`, `MAINTENANCE`
- Server statuses: `ONLINE`, `OFFLINE`, `UNKNOWN`, `ERROR`
- Health statuses: `HEALTHY`, `WARNING`, `CRITICAL`, `UNREACHABLE`, `UNKNOWN`, `MAINTENANCE`
- Debounced localStorage saves (300ms) for camera position to avoid excessive writes during pan/zoom
- Spring physics constants for agent/github/claude nodes: STIFFNESS=220, DAMPING=18, SETTLE_V=0.05, SETTLE_D=0.15 — updated via rAF, not React state, for performance
- Deploy popup uses `executeCommandApi` (server-side execution), NOT WebSocket terminal — ensures deploy completes even if connection drops
- Canvas nodes (GitHub, Claude) positioned relative to parent server with spring animation; default offsets avoid overlapping with agent ring (140px radius)
