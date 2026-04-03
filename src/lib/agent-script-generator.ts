import type { ZipAnalysis, ZipEntry } from "./zip-analyzer";

/* ------------------------------------------------------------------ */
/*  Options                                                            */
/* ------------------------------------------------------------------ */

export interface AgentScriptOptions {
  defaultDomain: string;
  defaultAgentsDir: string;
  dockerImage: string;
  includeGoogleOAuth: boolean;
  gogGmail: boolean;
  gogCalendar: boolean;
  gogDrive: boolean;
  gogDocs: boolean;
  gogSheets: boolean;
  includePairing: boolean;
  includeCaddy: boolean;
  includeHealthCheck: boolean;
  includeTelegram: boolean;
  includeSlack: boolean;
  includeWhatsApp: boolean;
  includeAtlassian: boolean;
  includeBitbucket: boolean;
  includeGitHub: boolean;
}

export const DEFAULT_AGENT_SCRIPT_OPTIONS: AgentScriptOptions = {
  defaultDomain: "viksi.ai",
  defaultAgentsDir: "/root/openclaw-agents",
  dockerImage: "openclaw:local",
  includeGoogleOAuth: true,
  gogGmail: true,
  gogCalendar: true,
  gogDrive: true,
  gogDocs: true,
  gogSheets: true,
  includePairing: true,
  includeCaddy: true,
  includeHealthCheck: true,
  includeTelegram: true,
  includeSlack: true,
  includeWhatsApp: false,
  includeAtlassian: true,
  includeBitbucket: true,
  includeGitHub: true,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uniqueDelimiter(content: string): string {
  let delim = "CLAWOPS_EOF";
  let i = 0;
  while (content.includes(delim)) {
    delim = `CLAWOPS_EOF_${(i++).toString(16)}`;
  }
  return delim;
}

function collectDirectories(entries: ZipEntry[]): string[] {
  const dirs = new Set<string>();
  for (const entry of entries) {
    if (entry.isDirectory) {
      const p = entry.path.replace(/\/$/, "");
      if (p) dirs.add(p);
      continue;
    }
    const slashIdx = entry.path.lastIndexOf("/");
    if (slashIdx > 0) {
      const parent = entry.path.slice(0, slashIdx);
      const parts = parent.split("/");
      for (let i = 1; i <= parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    }
  }
  return [...dirs].sort();
}

/**
 * Strip common root directory prefix from ZIP entries.
 * When a user zips a folder like `qa/`, all paths start with `qa/`.
 * We strip it so files land directly under $AGENT_DIR/config/, $AGENT_DIR/workspace/, etc.
 */
function stripCommonPrefix(entries: ZipEntry[]): ZipEntry[] {
  let current = [...entries];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const paths = current
      .map((e) => e.path.replace(/\/$/, ""))
      .filter((p) => p.length > 0);
    if (paths.length === 0) break;

    // Get unique top-level segments
    const topLevel = new Set(paths.map((p) => p.split("/")[0]));

    // Only strip if there's exactly one top-level entry (a wrapper directory)
    if (topLevel.size !== 1) break;

    // Must have nested paths (not just a single file)
    if (!paths.some((p) => p.includes("/"))) break;

    const prefix = [...topLevel][0] + "/";
    current = current
      .map((e) => ({ ...e, path: e.path.startsWith(prefix) ? e.path.slice(prefix.length) : e.path }))
      .filter((e) => e.path !== "" && e.path !== "/");
  }

  return current;
}

/* ------------------------------------------------------------------ */
/*  Generator                                                          */
/* ------------------------------------------------------------------ */

export function generateAgentScript(
  analysis: ZipAnalysis,
  options: AgentScriptOptions,
  zipFileName?: string,
): string {
  const lines: string[] = [];

  // Strip wrapper directories (e.g., "qa/" or "dpo/") so files
  // land at $AGENT_DIR/config/... instead of $AGENT_DIR/qa/config/...
  const entries = stripCommonPrefix(analysis.entries);

  const textFiles = entries.filter((e) => !e.isDirectory && !e.isBinary);
  const binaryFiles = entries.filter((e) => !e.isDirectory && e.isBinary);
  const dirs = collectDirectories(entries);
  const totalFiles = textFiles.length + binaryFiles.length;

  // Calculate total provisioning steps
  let totalSteps = 9; // pre-flight, dirs, template, customize, USER.md, .env, docker-compose, permissions, start
  if (options.includeGoogleOAuth) totalSteps += 2;
  if (options.includeCaddy) totalSteps += 1;
  if (options.includeHealthCheck) totalSteps += 1;

  // ── Shebang ──────────────────────────────────────────────────────
  lines.push("#!/bin/bash");
  lines.push("set -euo pipefail");
  lines.push("");
  lines.push("# ============================================================================");
  lines.push("# ClawOps Agent Provisioning Script (self-contained)");
  lines.push("#");
  lines.push("# Generated from: " + (zipFileName ?? "agent-template.zip"));
  lines.push("# Template files are embedded — no template directory needed on the server.");
  lines.push("#");
  lines.push("# Usage:");
  lines.push('#   Interactive:  ./script.sh');
  lines.push('#   One-liner:    ./script.sh "Full Name" email@company.com PORT');
  lines.push("# ============================================================================");
  lines.push("");

  // ── Colors ───────────────────────────────────────────────────────
  lines.push("# --- Colors ---");
  lines.push("PINK='\\033[38;5;205m'");
  lines.push("HOTPINK='\\033[38;5;198m'");
  lines.push("MAGENTA='\\033[38;5;170m'");
  lines.push("TEAL='\\033[38;5;43m'");
  lines.push("LTPINK='\\033[38;5;218m'");
  lines.push("GREEN='\\033[38;5;114m'");
  lines.push("RED='\\033[38;5;196m'");
  lines.push("YELLOW='\\033[38;5;222m'");
  lines.push("DIM='\\033[2m'");
  lines.push("BOLD='\\033[1m'");
  lines.push("NC='\\033[0m'");
  lines.push("");

  // ── Config ───────────────────────────────────────────────────────
  lines.push("# --- Config ---");
  lines.push('AGENTS_DIR="${AGENTS_DIR:-' + options.defaultAgentsDir + '}"');
  lines.push('GOG_BINARY="${GOG_BINARY:-/root/.openclaw/gog}"');
  lines.push('GOG_HOST_CONFIG="${GOG_HOST_CONFIG:-/root/.config/gogcli}"');
  lines.push('GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-ZdravoMajmuni7!!}"');
  lines.push('ATLASSIAN_URL="${ATLASSIAN_URL:-https://reputeo.atlassian.net}"');
  lines.push('IMAGE="${IMAGE:-' + options.dockerImage + '}"');
  lines.push('DOMAIN="${DOMAIN:-' + options.defaultDomain + '}"');
  if (options.includeCaddy) {
    lines.push('CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"');
  }
  lines.push("");

  // ── Helpers ──────────────────────────────────────────────────────
  lines.push("# --- Helpers ---");
  lines.push('step_ok()   { echo -e "  ${GREEN}\\u2713${NC} $1"; }');
  lines.push('step_warn() { echo -e "  ${YELLOW}\\u26a0${NC} $1"; }');
  lines.push('step_fail() { echo -e "  ${RED}\\u2717${NC} $1"; }');
  lines.push('step_skip() { echo -e "  ${DIM}\\u25cb${NC} $1"; }');
  lines.push("step_header() {");
  lines.push("    local num=$1 total=$2 msg=$3");
  lines.push("    local filled=$((num * 20 / total))");
  lines.push("    local empty=$((20 - filled))");
  lines.push('    printf "  ${PINK}"; printf "\\u2588%.0s" $(seq 1 $filled) 2>/dev/null || true');
  lines.push('    printf "${DIM}"; printf "\\u2591%.0s" $(seq 1 $empty) 2>/dev/null || true');
  lines.push('    printf "${NC} ${DIM}%2d/%d${NC}  ${TEAL}%s${NC}\\n" "$num" "$total" "$msg"');
  lines.push("}");
  lines.push("");
  lines.push("# --- Port scanner ---");
  lines.push("find_free_port() {");
  lines.push("    local port=${1:-18801}");
  lines.push('    while ss -tlnp 2>/dev/null | grep -q ":$port " || ss -tlnp 2>/dev/null | grep -q ":$((port + 1)) "; do');
  lines.push("        port=$((port + 2))");
  lines.push("    done");
  lines.push("    echo $port");
  lines.push("}");
  lines.push("");

  // ── Rollback ─────────────────────────────────────────────────────
  lines.push("# --- Rollback ---");
  lines.push("AGENT_DIR_CREATED=false");
  lines.push("cleanup() {");
  lines.push('    if [ "$AGENT_DIR_CREATED" = true ] && [ -n "${AGENT_DIR:-}" ] && [ -d "${AGENT_DIR:-}" ]; then');
  lines.push('        echo -e "\\n  ${RED}Rolling back \\u2014 removing $AGENT_DIR${NC}"');
  if (options.includeCaddy) {
    lines.push('        [ -n "${SUBDOMAIN:-}" ] && sed -i "/# Agent:.*${SLUG}/,/^}$/d" "$CADDYFILE" 2>/dev/null && systemctl reload caddy 2>/dev/null || true');
  }
  lines.push('        cd "$AGENT_DIR" && docker compose down 2>/dev/null || true');
  lines.push('        cd /root && rm -rf "$AGENT_DIR"');
  lines.push('        echo -e "  ${RED}Rollback complete.${NC}"');
  lines.push("    fi");
  lines.push("}");
  lines.push("trap cleanup EXIT");
  lines.push("");

  // ── Header ───────────────────────────────────────────────────────
  lines.push("# --- Header ---");
  lines.push("clear");
  lines.push('echo ""');
  lines.push('echo -e "  ${HOTPINK}\\u2584\\u259f\\u2588\\u2588\\u2588\\u2599\\u2584${NC}  ${BOLD}ClawOps${NC} ${DIM}v2.0${NC}"');
  lines.push('echo -e "  ${HOTPINK}\\u2588\\u2598\\u2588\\u2588\\u2588\\u259d\\u2588${NC}  ${DIM}Self-contained agent provisioning${NC}"');
  lines.push('echo -e " ${HOTPINK}\\u2598${TEAL} \\u259c\\u2588\\u2588\\u2588\\u259b ${HOTPINK}\\u259d${NC}  ${DIM}' + totalFiles + ' template files embedded${NC}"');
  lines.push('echo ""');
  lines.push("sleep 0.2");
  lines.push("");

  // ══════════════════════════════════════════════════════════════════
  // STEP 1: EMPLOYEE INFO
  // ══════════════════════════════════════════════════════════════════
  lines.push("# ============================================================================");
  lines.push("# STEP 1: EMPLOYEE INFO");
  lines.push("# ============================================================================");
  lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}Employee Information${NC}"');
  lines.push('echo ""');
  lines.push("");
  lines.push('if [ "$#" -ge 3 ]; then');
  lines.push('    FULL_NAME="$1"; EMAIL="$2"; PORT="$3"');
  lines.push('    echo -e "  ${DIM}name${NC}       ${LTPINK}$FULL_NAME${NC}"');
  lines.push('    echo -e "  ${DIM}email${NC}      ${LTPINK}$EMAIL${NC}"');
  lines.push('    echo -e "  ${DIM}port${NC}       ${LTPINK}$PORT${NC}"');
  lines.push('    echo ""');
  lines.push("else");
  lines.push('    echo -ne "  ${PINK}\\u203a${NC} Full name: "');
  lines.push("    read FULL_NAME");
  lines.push('    [ -z "$FULL_NAME" ] && { step_fail "Name required."; exit 1; }');
  lines.push("");
  lines.push('    echo -ne "  ${PINK}\\u203a${NC} Email: "');
  lines.push("    read EMAIL");
  lines.push('    [ -z "$EMAIL" ] && { step_fail "Email required."; exit 1; }');
  lines.push("");
  lines.push("    LAST_PORT=$(docker ps --format '{{.Ports}}' 2>/dev/null | grep -oP '\\d+(?=->18789)' | sort -n | tail -1 || true)");
  lines.push("    START_PORT=${LAST_PORT:+$((LAST_PORT + 2))}; START_PORT=${START_PORT:-18801}");
  lines.push("    SUGGESTED_PORT=$(find_free_port $START_PORT)");
  lines.push('    echo -ne "  ${PINK}\\u203a${NC} Gateway port ${DIM}[$SUGGESTED_PORT]${NC}: "');
  lines.push("    read PORT; PORT=${PORT:-$SUGGESTED_PORT}");
  lines.push("fi");
  lines.push("");
  lines.push("FIRST_NAME=$(echo \"$FULL_NAME\" | awk '{print $1}')");
  lines.push("SLUG=$(echo \"$FULL_NAME\" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')");
  lines.push('AGENT_DIR="$AGENTS_DIR/$SLUG"');
  lines.push("BRIDGE_PORT=$((PORT + 1))");
  lines.push('SUBDOMAIN="${SLUG}.${DOMAIN}"');
  lines.push('echo ""');
  lines.push("");

  // ══════════════════════════════════════════════════════════════════
  // STEP 2: MESSAGING CHANNEL
  // ══════════════════════════════════════════════════════════════════
  lines.push("# ============================================================================");
  lines.push("# STEP 2: MESSAGING CHANNEL");
  lines.push("# ============================================================================");
  lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}Messaging Channels${NC}"');
  lines.push('echo ""');
  lines.push('USE_TELEGRAM=false; USE_SLACK=false; USE_WHATSAPP=false');
  lines.push('BOT_TOKEN=""; SLACK_APP_TOKEN=""; SLACK_BOT_TOKEN=""');
  if (options.includeTelegram) {
    lines.push('echo -ne "  ${PINK}\\u203a${NC} Telegram? ${DIM}(y/n)${NC}: "; read _ans');
    lines.push('[[ "$_ans" =~ ^[Yy]$ ]] && USE_TELEGRAM=true');
  }
  if (options.includeSlack) {
    lines.push('echo -ne "  ${PINK}\\u203a${NC} Slack? ${DIM}(y/n)${NC}: "; read _ans');
    lines.push('[[ "$_ans" =~ ^[Yy]$ ]] && USE_SLACK=true');
  }
  if (options.includeWhatsApp) {
    lines.push('echo -ne "  ${PINK}\\u203a${NC} WhatsApp? ${DIM}(y/n)${NC}: "; read _ans');
    lines.push('[[ "$_ans" =~ ^[Yy]$ ]] && USE_WHATSAPP=true');
  }
  lines.push('[ "$USE_TELEGRAM" = false ] && [ "$USE_SLACK" = false ] && [ "$USE_WHATSAPP" = false ] && { step_fail "Select at least one channel."; exit 1; }');
  lines.push('echo ""');
  lines.push("");

  // ══════════════════════════════════════════════════════════════════
  // STEP 3: API TOKENS
  // ══════════════════════════════════════════════════════════════════
  lines.push("# ============================================================================");
  lines.push("# STEP 3: API TOKENS");
  lines.push("# ============================================================================");
  lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}API Tokens${NC}"');
  lines.push('echo ""');
  lines.push("");
  lines.push('if [ "$USE_TELEGRAM" = true ]; then');
  lines.push('    echo -ne "  ${PINK}\\u203a${NC} Telegram bot token: "; read BOT_TOKEN');
  lines.push('    [ -z "$BOT_TOKEN" ] && { step_fail "Required."; exit 1; }; step_ok "Telegram"; echo ""');
  lines.push("fi");
  lines.push('if [ "$USE_SLACK" = true ]; then');
  lines.push('    echo -ne "  ${PINK}\\u203a${NC} Slack app token (xapp-...): "; read SLACK_APP_TOKEN');
  lines.push('    [ -z "$SLACK_APP_TOKEN" ] && { step_fail "Required."; exit 1; }; step_ok "Slack app"');
  lines.push('    echo -ne "  ${PINK}\\u203a${NC} Slack bot token (xoxb-...): "; read SLACK_BOT_TOKEN');
  lines.push('    [ -z "$SLACK_BOT_TOKEN" ] && { step_fail "Required."; exit 1; }; step_ok "Slack bot"; echo ""');
  lines.push("fi");
  lines.push("");

  // Atlassian
  if (options.includeAtlassian) {
    lines.push('echo -ne "  ${PINK}\\u203a${NC} Atlassian API token ${DIM}(Jira+Confluence)${NC}: "; read ATLASSIAN_TOKEN');
    lines.push('[ -z "$ATLASSIAN_TOKEN" ] && { step_fail "Required."; exit 1; }; step_ok "Atlassian"; echo ""');
    lines.push("");
  } else {
    lines.push('ATLASSIAN_TOKEN=""');
  }

  // Optional integrations header (only if any optional integration is enabled)
  if (options.includeBitbucket || options.includeGitHub) {
    lines.push('echo -e "  ${DIM}Optional integrations (Enter to skip):${NC}"; echo ""');
    lines.push("");
  }

  // Bitbucket
  if (options.includeBitbucket) {
    lines.push('echo -ne "  ${PINK}\\u203a${NC} Bitbucket workspace slug: "; read BITBUCKET_WORKSPACE');
    lines.push('BITBUCKET_API_TOKEN=""');
    lines.push('if [ -n "$BITBUCKET_WORKSPACE" ]; then');
    lines.push('    echo -ne "  ${PINK}\\u203a${NC} Bitbucket API token ${DIM}(read-only)${NC}: "; read BITBUCKET_API_TOKEN');
    lines.push('    [ -z "$BITBUCKET_API_TOKEN" ] && { step_warn "Skipped"; BITBUCKET_WORKSPACE=""; } || step_ok "Bitbucket"');
    lines.push('else step_skip "Bitbucket skipped"; fi; echo ""');
    lines.push("");
  } else {
    lines.push('BITBUCKET_WORKSPACE=""');
    lines.push('BITBUCKET_API_TOKEN=""');
  }

  // GitHub
  if (options.includeGitHub) {
    lines.push('echo -ne "  ${PINK}\\u203a${NC} GitHub token: "; read GITHUB_TOKEN');
    lines.push('GITHUB_ORG=""');
    lines.push('if [ -n "$GITHUB_TOKEN" ]; then');
    lines.push('    echo -ne "  ${PINK}\\u203a${NC} GitHub org: "; read GITHUB_ORG');
    lines.push('    [ -z "$GITHUB_ORG" ] && { step_warn "Skipped"; GITHUB_TOKEN=""; } || step_ok "GitHub"');
    lines.push('else step_skip "GitHub skipped"; fi; echo ""');
    lines.push("");
  } else {
    lines.push('GITHUB_TOKEN=""');
    lines.push('GITHUB_ORG=""');
  }

  // OpenRouter (always required)
  lines.push('echo -ne "  ${PINK}\\u203a${NC} OpenRouter API key: "; read OPENROUTER_API_KEY');
  lines.push('[ -z "$OPENROUTER_API_KEY" ] && { step_fail "OpenRouter API key is required."; exit 1; }; step_ok "OpenRouter"');
  lines.push('echo ""');
  lines.push("");

  // ══════════════════════════════════════════════════════════════════
  // STEP 4: CONFIRM
  // ══════════════════════════════════════════════════════════════════
  lines.push("# ============================================================================");
  lines.push("# STEP 4: CONFIRM");
  lines.push("# ============================================================================");
  lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}Review${NC}"');
  lines.push('echo ""');
  lines.push('echo -e "  ${DIM}name${NC}         ${LTPINK}$FULL_NAME${NC}"');
  lines.push('echo -e "  ${DIM}email${NC}        ${LTPINK}$EMAIL${NC}"');
  lines.push('echo -e "  ${DIM}ports${NC}        ${LTPINK}$PORT / $BRIDGE_PORT${NC}"');
  lines.push('echo -e "  ${DIM}channels${NC}     ${LTPINK}$([ "$USE_TELEGRAM" = true ] && echo -n "Telegram ")$([ "$USE_SLACK" = true ] && echo -n "Slack ")$([ "$USE_WHATSAPP" = true ] && echo -n "WhatsApp")${NC}"');
  lines.push('echo ""');
  lines.push('echo -ne "  ${PINK}\\u203a${NC} Proceed? ${DIM}(y/n)${NC}: "; read CONFIRM');
  lines.push('[[ ! "$CONFIRM" =~ ^[Yy]$ ]] && { echo -e "\\n  ${YELLOW}Aborted.${NC}"; exit 0; }');
  lines.push('echo ""');
  lines.push("");

  // ══════════════════════════════════════════════════════════════════
  // PROVISIONING
  // ══════════════════════════════════════════════════════════════════
  lines.push("# ============================================================================");
  lines.push("# PROVISIONING");
  lines.push("# ============================================================================");
  lines.push("TOTAL_STEPS=" + totalSteps);
  lines.push("STEP=0");
  lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}Provisioning${NC}"');
  lines.push('echo ""');
  lines.push("");

  // ── 1. Pre-flight ────────────────────────────────────────────────
  lines.push("# Pre-flight checks");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Pre-flight checks"');
  lines.push('[ -d "$AGENT_DIR" ] && { step_fail "Directory exists: $AGENT_DIR"; exit 1; }');
  lines.push('ss -tlnp | grep -q ":$PORT " && { step_fail "Port $PORT in use."; exit 1; }');
  lines.push("! docker images | grep -q \"openclaw.*local\" && { step_fail \"Docker image not found.\"; exit 1; }");
  lines.push('command -v python3 >/dev/null 2>&1 || { step_fail "python3 is required."; exit 1; }');
  lines.push('step_ok "All checks passed"');
  lines.push("");

  // ── 2. Directories ───────────────────────────────────────────────
  lines.push("# Create directories");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Creating directories"');
  lines.push('mkdir -p "$AGENT_DIR/config/agents/main/agent" "$AGENT_DIR/workspace" "$AGENT_DIR/gogcli-config/keyring"');
  for (const dir of dirs) {
    lines.push('mkdir -p "$AGENT_DIR/' + dir + '"');
  }
  lines.push("AGENT_DIR_CREATED=true");
  lines.push('step_ok "Done"');
  lines.push("");

  // ── 3. Write embedded template files ─────────────────────────────
  lines.push("# Write embedded template files");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Writing template files (' + totalFiles + ' files)"');
  lines.push("");

  for (const entry of textFiles) {
    const content = entry.content ?? "";
    const delim = uniqueDelimiter(content);
    lines.push('cat > "$AGENT_DIR/' + entry.path + '" << \'' + delim + "'");
    lines.push(content.endsWith("\n") ? content.slice(0, -1) : content);
    lines.push(delim);
    lines.push("");
  }

  for (const entry of binaryFiles) {
    if (!entry.base64) continue;
    const delim = uniqueDelimiter(entry.base64);
    lines.push('base64 -d > "$AGENT_DIR/' + entry.path + '" << \'' + delim + "'");
    lines.push(entry.base64);
    lines.push(delim);
    lines.push("");
  }

  lines.push('mkdir -p "$AGENT_DIR/workspace/memory"');
  lines.push('find "$AGENT_DIR/workspace/skills" -name "*.sh" -exec chmod +x {} \\; 2>/dev/null || true');
  lines.push('step_ok "Template files written"');
  lines.push("");

  // ── 4. Customize config ──────────────────────────────────────────
  lines.push("# Customize config");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Customizing config"');
  lines.push("GATEWAY_TOKEN=$(openssl rand -hex 32)");
  lines.push('if [ -f "$AGENT_DIR/config/openclaw.json" ]; then');
  lines.push("python3 << PYEOF");
  lines.push("import json");
  lines.push('with open("$AGENT_DIR/config/openclaw.json", "r") as f:');
  lines.push("    config = json.load(f)");
  lines.push("");
  lines.push("# Gateway — ensure all required fields exist");
  lines.push('gw = config.setdefault("gateway", {})');
  lines.push('gw.setdefault("port", 18789)');
  lines.push('gw.setdefault("mode", "local")');
  lines.push('gw.setdefault("bind", "lan")');
  lines.push('gw.setdefault("auth", {"mode": "token"})["token"] = "$GATEWAY_TOKEN"');
  lines.push("");
  lines.push("# ControlUI");
  lines.push('ui = gw.setdefault("controlUi", {})');
  lines.push('ui["allowedOrigins"] = ["https://$SUBDOMAIN"]');
  lines.push('ui["dangerouslyDisableDeviceAuth"] = True');
  lines.push('ui["allowInsecureAuth"] = True');
  lines.push("");
  lines.push("# Workspace path");
  lines.push('config.setdefault("agents", {}).setdefault("defaults", {}).setdefault("workspace", "/home/node/.openclaw/workspace")');
  lines.push("");
  lines.push("# Channels");
  lines.push('if "channels" not in config: config["channels"] = {}');
  lines.push('if "$USE_TELEGRAM" == "true":');
  lines.push('    tg = config.get("channels", {}).get("telegram", {})');
  lines.push('    tg["enabled"] = True; tg["botToken"] = "$BOT_TOKEN"');
  lines.push('    config["channels"]["telegram"] = tg');
  lines.push('else: config["channels"].pop("telegram", None)');
  lines.push('if "$USE_SLACK" == "true":');
  lines.push('    config["channels"]["slack"] = {"enabled":True,"mode":"socket","appToken":"$SLACK_APP_TOKEN","botToken":"$SLACK_BOT_TOKEN","dmPolicy":"pairing","streaming":"partial","nativeStreaming":True,"blockStreaming":True}');
  lines.push('else: config["channels"].pop("slack", None)');
  lines.push('if "$USE_WHATSAPP" == "true":');
  lines.push('    config["channels"]["whatsapp"] = {"enabled": True}');
  lines.push('else: config["channels"].pop("whatsapp", None)');
  lines.push("");
  lines.push("# Plugins — enable selected channel plugins");
  lines.push('plugins = config.setdefault("plugins", {}).setdefault("entries", {})');
  lines.push('if "$USE_TELEGRAM" == "true": plugins.setdefault("telegram", {})["enabled"] = True');
  lines.push('else: plugins.pop("telegram", None)');
  lines.push('if "$USE_SLACK" == "true": plugins.setdefault("slack", {})["enabled"] = True');
  lines.push('else: plugins.pop("slack", None)');
  lines.push('if "$USE_WHATSAPP" == "true": plugins.setdefault("whatsapp", {})["enabled"] = True');
  lines.push('else: plugins.pop("whatsapp", None)');
  lines.push("");
  lines.push('with open("$AGENT_DIR/config/openclaw.json", "w") as f:');
  lines.push("    json.dump(config, f, indent=2)");
  lines.push("PYEOF");
  lines.push('step_ok "Config customized"');
  lines.push("else");
  lines.push('step_warn "No openclaw.json found — skipping customization"');
  lines.push("fi");
  lines.push("");

  // Regenerate exec-approvals.json socket token (each agent needs a unique one)
  lines.push('if [ -f "$AGENT_DIR/config/exec-approvals.json" ]; then');
  lines.push('EXEC_TOKEN=$(openssl rand -base64 24 | tr -d "/+=" | head -c 32)');
  lines.push("python3 << EAEOF");
  lines.push("import json");
  lines.push('with open("$AGENT_DIR/config/exec-approvals.json", "r") as f:');
  lines.push("    ea = json.load(f)");
  lines.push('if "socket" in ea: ea["socket"]["token"] = "$EXEC_TOKEN"');
  lines.push('with open("$AGENT_DIR/config/exec-approvals.json", "w") as f:');
  lines.push("    json.dump(ea, f, indent=2)");
  lines.push("EAEOF");
  lines.push('step_ok "exec-approvals token regenerated"');
  lines.push("fi");
  lines.push("");

  // ── 5. USER.md ───────────────────────────────────────────────────
  lines.push("# Generate USER.md");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Generating USER.md"');
  lines.push('cat > "$AGENT_DIR/workspace/USER.md" << USEREOF');
  lines.push("# USER.md - About Your Human");
  lines.push("");
  lines.push("- **Name:** $FULL_NAME");
  lines.push("- **What to call them:** $FIRST_NAME");
  lines.push("- **Email:** $EMAIL");
  lines.push("- **Timezone:** Europe/Belgrade (CET/CEST)");
  lines.push("- **Organization:** Reputeo");
  lines.push("USEREOF");
  lines.push('step_ok "Done"');
  lines.push("");

  // ── 6. .env ──────────────────────────────────────────────────────
  lines.push("# Generate .env");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Generating .env"');
  lines.push('cat > "$AGENT_DIR/.env" << ENVEOF');
  lines.push("OPENCLAW_CONFIG_DIR=$AGENT_DIR/config");
  lines.push("OPENCLAW_WORKSPACE_DIR=$AGENT_DIR/workspace");
  lines.push("OPENCLAW_GATEWAY_PORT=$PORT");
  lines.push("OPENCLAW_BRIDGE_PORT=$BRIDGE_PORT");
  lines.push("OPENCLAW_GATEWAY_BIND=lan");
  lines.push("OPENCLAW_GATEWAY_TOKEN=$GATEWAY_TOKEN");
  lines.push("OPENCLAW_IMAGE=$IMAGE");
  lines.push("ENVEOF");
  lines.push('step_ok "Done"');
  lines.push("");

  // ── 7. docker-compose.yml ────────────────────────────────────────
  lines.push("# Generate docker-compose.yml");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Generating docker-compose.yml"');
  // Build docker-compose environment block (conditional integrations)
  const envBlock = (extra: string[]) => {
    const env = [
      "      HOME: /home/node",
      "      TERM: xterm-256color",
      "      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}",
      ...extra,
      "      GOG_KEYRING_BACKEND: file",
      "      GOG_ACCOUNT: __EMAIL__",
      "      GOG_KEYRING_PASSWORD: __GOG_PASSWORD__",
    ];
    if (options.includeAtlassian) {
      env.push("      ATLASSIAN_URL: __ATLASSIAN_URL__");
      env.push("      ATLASSIAN_EMAIL: __EMAIL__");
      env.push("      ATLASSIAN_API_TOKEN: __ATLASSIAN_TOKEN__");
    }
    if (options.includeBitbucket) {
      env.push("      BITBUCKET_WORKSPACE: __BITBUCKET_WORKSPACE__");
      env.push("      BITBUCKET_API_TOKEN: __BITBUCKET_API_TOKEN__");
    }
    if (options.includeGitHub) {
      env.push("      GITHUB_TOKEN: __GITHUB_TOKEN__");
      env.push("      GITHUB_ORG: __GITHUB_ORG__");
    }
    env.push("      OPENROUTER_API_KEY: __OPENROUTER_API_KEY__");
    return env;
  };

  lines.push("cat > \"$AGENT_DIR/docker-compose.yml\" << 'DCEOF'");
  lines.push("services:");
  lines.push("  openclaw-gateway:");
  lines.push("    image: ${OPENCLAW_IMAGE:-openclaw:local}");
  lines.push("    environment:");
  for (const l of envBlock([])) lines.push(l);
  lines.push("    volumes:");
  lines.push("      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw");
  lines.push("      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace");
  lines.push("      - __GOG_BINARY__:/usr/local/bin/gog:ro");
  lines.push("      - __AGENT_DIR__/gogcli-config:/home/node/.config/gogcli");
  lines.push("    ports:");
  lines.push('      - "${OPENCLAW_GATEWAY_PORT:-18789}:18789"');
  lines.push('      - "${OPENCLAW_BRIDGE_PORT:-18790}:18790"');
  lines.push("    init: true");
  lines.push("    restart: unless-stopped");
  lines.push('    command: ["node","dist/index.js","gateway","--bind","${OPENCLAW_GATEWAY_BIND:-lan}","--port","18789"]');
  lines.push("    healthcheck:");
  lines.push("      test: [\"CMD\",\"node\",\"-e\",\"fetch('http://127.0.0.1:18789/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"]");
  lines.push("      interval: 30s");
  lines.push("      timeout: 5s");
  lines.push("      retries: 5");
  lines.push("      start_period: 20s");
  lines.push("  openclaw-cli:");
  lines.push("    image: ${OPENCLAW_IMAGE:-openclaw:local}");
  lines.push('    network_mode: "service:openclaw-gateway"');
  lines.push("    cap_drop: [NET_RAW, NET_ADMIN]");
  lines.push("    security_opt: [no-new-privileges:true]");
  lines.push("    environment:");
  for (const l of envBlock(["      BROWSER: echo"])) lines.push(l);
  lines.push("    volumes:");
  lines.push("      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw");
  lines.push("      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace");
  lines.push("      - __GOG_BINARY__:/usr/local/bin/gog:ro");
  lines.push("      - __AGENT_DIR__/gogcli-config:/home/node/.config/gogcli");
  lines.push("    stdin_open: true");
  lines.push("    tty: true");
  lines.push("    init: true");
  lines.push('    entrypoint: ["node","dist/index.js"]');
  lines.push("    depends_on: [openclaw-gateway]");
  lines.push("DCEOF");
  lines.push("");

  // sed replacements for docker-compose placeholders
  const sedPairs: string[] = [
    '"__EMAIL__|$EMAIL"',
    '"__GOG_PASSWORD__|$GOG_KEYRING_PASSWORD"',
  ];
  if (options.includeAtlassian) {
    sedPairs.push('"__ATLASSIAN_URL__|$ATLASSIAN_URL"');
    sedPairs.push('"__ATLASSIAN_TOKEN__|${ATLASSIAN_TOKEN:-}"');
  }
  if (options.includeBitbucket) {
    sedPairs.push('"__BITBUCKET_WORKSPACE__|${BITBUCKET_WORKSPACE:-}"');
    sedPairs.push('"__BITBUCKET_API_TOKEN__|${BITBUCKET_API_TOKEN:-}"');
  }
  if (options.includeGitHub) {
    sedPairs.push('"__GITHUB_TOKEN__|${GITHUB_TOKEN:-}"');
    sedPairs.push('"__GITHUB_ORG__|${GITHUB_ORG:-}"');
  }
  sedPairs.push('"__OPENROUTER_API_KEY__|$OPENROUTER_API_KEY"');
  sedPairs.push('"__GOG_BINARY__|$GOG_BINARY"');
  sedPairs.push('"__AGENT_DIR__|$AGENT_DIR"');

  lines.push("for placeholder in \\");
  for (let i = 0; i < sedPairs.length; i++) {
    const suffix = i < sedPairs.length - 1 ? " \\" : "; do";
    lines.push("    " + sedPairs[i] + suffix);
  }
  lines.push('    sed -i "s|${placeholder%%|*}|${placeholder#*|}|g" "$AGENT_DIR/docker-compose.yml"');
  lines.push("done");
  lines.push('step_ok "Done"');
  lines.push("");

  // ── 8–9. Google OAuth (optional) ─────────────────────────────────
  if (options.includeGoogleOAuth) {
    lines.push("SKIP_OAUTH=true");
    lines.push("# Google OAuth");
    lines.push('echo ""');
    lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}Google OAuth${NC}"');
    lines.push('echo ""');
    lines.push('echo -ne "  ${PINK}\\u203a${NC} Run Google OAuth now? ${DIM}(y/n)${NC}: "; read OA');
    lines.push('if [[ "$OA" =~ ^[Yy]$ ]]; then');
    lines.push("    SKIP_OAUTH=false");
    lines.push('    export GOG_KEYRING_BACKEND=file GOG_KEYRING_PASSWORD="$GOG_KEYRING_PASSWORD"');
    lines.push("    STEP=$((STEP + 1))");
    lines.push('    step_header $STEP $TOTAL_STEPS "Google OAuth"');
    // Build --services list from enabled toggles
    const gogServices: string[] = [];
    if (options.gogGmail) gogServices.push("gmail");
    if (options.gogCalendar) gogServices.push("calendar");
    if (options.gogDrive) gogServices.push("drive");
    if (options.gogDocs) gogServices.push("docs");
    if (options.gogSheets) gogServices.push("sheets");
    const servicesFlag = gogServices.length > 0 ? gogServices.join(",") : "gmail,calendar,drive,docs,sheets";
    lines.push('    "$GOG_BINARY" auth add "$EMAIL" --services ' + servicesFlag + ' --force-consent --manual');
    lines.push("    STEP=$((STEP + 1))");
    lines.push('    step_header $STEP $TOTAL_STEPS "Copying tokens"');
    lines.push('    cp "$GOG_HOST_CONFIG/credentials.json" "$AGENT_DIR/gogcli-config/" 2>/dev/null || true');
    lines.push('    [ -f "$GOG_HOST_CONFIG/keyring/token:default:$EMAIL" ] && \\');
    lines.push('        cp "$GOG_HOST_CONFIG/keyring/token:default:$EMAIL" "$AGENT_DIR/gogcli-config/keyring/" && step_ok "Tokens copied" || step_warn "Token not found"');
    lines.push("else");
    lines.push("    SKIP_OAUTH=true");
    lines.push("    STEP=$((STEP + 2))");
    lines.push('    step_skip "Google OAuth skipped"');
    lines.push("fi");
    lines.push("");
  }

  // ── Permissions ──────────────────────────────────────────────────
  lines.push("# Fix permissions");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Fixing permissions"');
  lines.push('chown -R 1000:1000 "$AGENT_DIR/config/" "$AGENT_DIR/workspace/"');
  lines.push('chmod -R 755 "$AGENT_DIR/gogcli-config/"');
  lines.push('find "$AGENT_DIR/gogcli-config/" -type f -exec chmod 644 {} \\; 2>/dev/null');
  lines.push('step_ok "Done"');
  lines.push("");

  // ── Caddy (optional) ─────────────────────────────────────────────
  if (options.includeCaddy) {
    lines.push("# Configure Caddy");
    lines.push("STEP=$((STEP + 1))");
    lines.push('step_header $STEP $TOTAL_STEPS "Configuring Caddy"');
    lines.push('sed -i "/# Agent:.*${SLUG}/,/^}$/d" "$CADDYFILE" 2>/dev/null || true');
    lines.push('sed -i "/^${SUBDOMAIN} {$/,/^}$/d" "$CADDYFILE" 2>/dev/null || true');
    lines.push('cat >> "$CADDYFILE" << CADDYEOF');
    lines.push("");
    lines.push("# Agent: $FULL_NAME ($EMAIL)");
    lines.push("${SUBDOMAIN} {");
    lines.push("    reverse_proxy localhost:${PORT}");
    lines.push("}");
    lines.push("CADDYEOF");
    lines.push('step_ok "$SUBDOMAIN -> :$PORT"');
    lines.push("");
  }

  // ── Start container ──────────────────────────────────────────────
  lines.push("# Start container");
  lines.push("STEP=$((STEP + 1))");
  lines.push('step_header $STEP $TOTAL_STEPS "Starting container"');
  lines.push('cd "$AGENT_DIR" && docker compose up -d 2>&1 | tail -3');
  lines.push('step_ok "Container started"');
  lines.push("");

  // ── Health check (optional) ──────────────────────────────────────
  if (options.includeHealthCheck) {
    lines.push("# Health check");
    lines.push("STEP=$((STEP + 1))");
    lines.push('step_header $STEP $TOTAL_STEPS "Health check"');
    lines.push("sleep 3");
    lines.push("HEALTHY=false");
    lines.push("for i in $(seq 1 20); do");
    lines.push("    docker compose exec -T openclaw-gateway node -e \"fetch('http://127.0.0.1:18789/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\" 2>/dev/null && { HEALTHY=true; break; }");
    lines.push('    printf "\\r  ${PINK}\\u23f3${NC} %ss..." "$((i*2))"; sleep 2');
    lines.push("done");
    lines.push('printf "\\r%40s\\r" ""');
    lines.push('[ "$HEALTHY" = true ] && step_ok "Agent online" || step_warn "Timed out \\u2014 check logs"');
    lines.push("");
  }

  // ── Caddy reload ─────────────────────────────────────────────────
  if (options.includeCaddy) {
    lines.push("# Reload Caddy");
    lines.push('caddy validate --config "$CADDYFILE" > /dev/null 2>&1 && { systemctl reload caddy 2>/dev/null; step_ok "Caddy live: https://$SUBDOMAIN"; } || step_warn "Caddy config invalid"');
    lines.push("");
  }

  // ══════════════════════════════════════════════════════════════════
  // VERIFICATION
  // ══════════════════════════════════════════════════════════════════
  lines.push("# ============================================================================");
  lines.push("# VERIFICATION");
  lines.push("# ============================================================================");
  lines.push('echo ""');
  lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}Verification${NC}"');
  lines.push('echo ""');

  // Telegram check
  lines.push('[ "$USE_TELEGRAM" = true ] && { BU=$(docker compose exec -T openclaw-gateway sh -c \'cat /tmp/openclaw/openclaw-*.log 2>/dev/null | grep -oP "starting provider \\(\\K@[^)]*" | tail -1\' 2>/dev/null || true); [ -n "$BU" ] && step_ok "Telegram:  ${LTPINK}$BU${NC}" || step_warn "Telegram:  unverified"; }');

  // Slack check
  lines.push('[ "$USE_SLACK" = true ] && { SO=$(docker compose exec -T openclaw-gateway sh -c \'cat /tmp/openclaw/openclaw-*.log 2>/dev/null | grep -i "slack.*connected\\|slack.*socket" | tail -1\' 2>/dev/null || true); [ -n "$SO" ] && step_ok "Slack:     connected" || step_warn "Slack:     unverified"; }');

  // WhatsApp check
  lines.push('[ "$USE_WHATSAPP" = true ] && { WA=$(docker compose exec -T openclaw-gateway sh -c \'cat /tmp/openclaw/openclaw-*.log 2>/dev/null | grep -i "whatsapp.*connected\\|whatsapp.*ready" | tail -1\' 2>/dev/null || true); [ -n "$WA" ] && step_ok "WhatsApp:  connected" || step_warn "WhatsApp:  unverified"; }');

  // Google check
  if (options.includeGoogleOAuth) {
    lines.push('[ "$SKIP_OAUTH" = false ] && { docker compose exec -T openclaw-gateway gog auth list 2>/dev/null | grep -q "$EMAIL" && step_ok "Google:    ${LTPINK}$EMAIL${NC}" || step_warn "Google:    unverified"; } || step_skip "Google:    skipped"');
  } else {
    lines.push('step_skip "Google:    skipped"');
  }

  // Atlassian check
  if (options.includeAtlassian) {
    lines.push('AR=$(docker compose exec -T openclaw-gateway sh -c "curl -s -u \\"\\$ATLASSIAN_EMAIL:\\$ATLASSIAN_API_TOKEN\\" \\"\\$ATLASSIAN_URL/rest/api/3/myself\\"" 2>/dev/null)');
    lines.push('echo "$AR" | grep -q "displayName" && { AN=$(echo "$AR" | python3 -c "import sys,json;print(json.load(sys.stdin)[\'displayName\'])" 2>/dev/null || echo "?"); step_ok "Atlassian: ${LTPINK}$AN${NC}"; } || step_warn "Atlassian: unverified"');
  } else {
    lines.push('step_skip "Atlassian: disabled"');
  }
  lines.push("");

  // ══════════════════════════════════════════════════════════════════
  // SUCCESS + PAIRING
  // ══════════════════════════════════════════════════════════════════
  lines.push("# ============================================================================");
  lines.push("# SUCCESS");
  lines.push("# ============================================================================");
  lines.push('echo ""');
  lines.push('echo -e "  ${HOTPINK}\\u2584\\u259f\\u2588\\u2588\\u2588\\u2599\\u2584${NC}  ${GREEN}${BOLD}Agent created!${NC}"');
  lines.push('echo -e " ${HOTPINK}\\u2598${TEAL} \\u259c\\u2588\\u2588\\u2588\\u259b ${HOTPINK}\\u259d${NC}  ${LTPINK}$FULL_NAME${NC} ${DIM}/ https://$SUBDOMAIN${NC}"');
  lines.push('echo ""');

  // Pairing (optional)
  if (options.includePairing) {
    lines.push("");
    lines.push('if [ "$USE_TELEGRAM" = true ]; then');
    lines.push('    echo -e "  ${TEAL}Telegram pairing${NC} \\u2014 have $FIRST_NAME message the bot"');
    lines.push('    echo -ne "  ${PINK}\\u203a${NC} Code ${DIM}(Enter to skip)${NC}: "; read PC');
    lines.push('    [ -n "$PC" ] && { PR=$(docker compose exec -T openclaw-gateway node dist/index.js pairing approve telegram "$PC" 2>&1); echo "$PR" | grep -qi "approved\\|success\\|paired" && step_ok "Paired" || step_warn "$PR"; } || step_skip "Skipped"');
    lines.push('    echo ""');
    lines.push("fi");
    lines.push('if [ "$USE_SLACK" = true ]; then');
    lines.push('    echo -e "  ${TEAL}Slack pairing${NC} \\u2014 have $FIRST_NAME DM the bot"');
    lines.push('    echo -ne "  ${PINK}\\u203a${NC} Code ${DIM}(Enter to skip)${NC}: "; read SPC');
    lines.push('    [ -n "$SPC" ] && { PR=$(docker compose exec -T openclaw-gateway node dist/index.js pairing approve slack "$SPC" 2>&1); echo "$PR" | grep -qi "approved\\|success\\|paired" && step_ok "Paired" || step_warn "$PR"; } || step_skip "Skipped"');
    lines.push('    echo ""');
    lines.push("fi");
    lines.push('if [ "$USE_WHATSAPP" = true ]; then');
    lines.push('    echo -e "  ${TEAL}WhatsApp pairing${NC} \\u2014 have $FIRST_NAME message the bot"');
    lines.push('    echo -ne "  ${PINK}\\u203a${NC} Code ${DIM}(Enter to skip)${NC}: "; read WPC');
    lines.push('    [ -n "$WPC" ] && { PR=$(docker compose exec -T openclaw-gateway node dist/index.js pairing approve whatsapp "$WPC" 2>&1); echo "$PR" | grep -qi "approved\\|success\\|paired" && step_ok "Paired" || step_warn "$PR"; } || step_skip "Skipped"');
    lines.push('    echo ""');
    lines.push("fi");
  }

  // ── Management ───────────────────────────────────────────────────
  lines.push('echo -e "  ${PINK}\\u258c${NC} ${BOLD}Management${NC}"');
  lines.push('echo ""');
  lines.push('echo "  logs      docker compose -f $AGENT_DIR/docker-compose.yml logs -f --tail 30"');
  lines.push('echo "  restart   docker compose -f $AGENT_DIR/docker-compose.yml restart"');
  lines.push('echo "  stop      docker compose -f $AGENT_DIR/docker-compose.yml down"');
  lines.push('echo ""');
  lines.push("");

  // Clear trap on success
  lines.push("trap - EXIT");

  return lines.join("\n");
}
