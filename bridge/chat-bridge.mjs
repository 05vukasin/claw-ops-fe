#!/usr/bin/env node

/**
 * ClawOps Chat Bridge
 *
 * Provider-aware chat bridge for Claude and Codex.
 *
 * Two modes:
 *   1. Terminal mode (default): reads stdin, writes stdout
 *   2. Background mode (--background --id ID): reads/writes files in ~/.claw-sessions/{ID}/
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";
import { appendFileSync, writeSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { spawnSync, spawn } from "child_process";

const args = process.argv.slice(2);
const isBackground = args.includes("--background");
const sessionId = readArgValue("--id");
const provider = readProvider(readArgValue("--provider"));
const resumeSessionId = readArgValue("--resume-session");

const SESSION_DIR = sessionId ? `${process.env.HOME}/.claw-sessions/${sessionId}` : null;
const LOG_FILE = isBackground && SESSION_DIR ? `${SESSION_DIR}/bridge.log` : "/tmp/claw-bridge.log";

const pendingRequests = new Map();
let requestCounter = 0;
let currentSessionId = resumeSessionId || null;
let isProcessing = false;
const messageQueue = [];
let pendingEvents = [];
const sessionAllowedTools = new Set();
let currentPermissionMode = "default";
let currentEffort = null;
let accumulatedText = "";

let codexServer = null;
let codexBuffer = "";
let codexRpcId = 1;
const codexPending = new Map();
const codexApprovalRequests = new Map();
let codexInitialized = false;
let codexThreadId = resumeSessionId || null;
let codexCurrentToolId = null;

function readArgValue(flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : null;
}

function readProvider(value) {
  return value === "codex" ? "codex" : "claude";
}

function log(msg) {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

function emit(obj) {
  const line = JSON.stringify(obj) + "\n";
  log(`EMIT: ${line.trim()}`);

  if (isBackground && SESSION_DIR) {
    try { appendFileSync(`${SESSION_DIR}/output.jsonl`, line); } catch {}
  } else {
    writeSync(1, line);
  }

  if (
    obj.type === "permission_request" ||
    obj.type === "ask_question" ||
    obj.type === "tool_use_start" ||
    obj.type === "tool_result" ||
    obj.type === "result"
  ) {
    pendingEvents.push(obj);
  }
}

function updateMeta(updates) {
  if (!isBackground || !SESSION_DIR) return;
  try {
    let meta = {};
    try { meta = JSON.parse(readFileSync(`${SESSION_DIR}/meta.json`, "utf-8")); } catch {}
    Object.assign(meta, updates, { lastActivity: Date.now() });
    writeFileSync(`${SESSION_DIR}/meta.json`, JSON.stringify(meta));
  } catch {}
}

function waitForResponse(id) {
  return new Promise((resolve) => pendingRequests.set(id, resolve));
}

function getToolDescription(toolName, input) {
  if (toolName === "Bash" && input.command) return input.command.slice(0, 120);
  if (["Read", "Write", "Edit"].includes(toolName) && input.file_path) return input.file_path;
  if (toolName === "Grep" && input.pattern) return `pattern: ${input.pattern}`;
  if (toolName === "Glob" && input.pattern) return `pattern: ${input.pattern}`;
  return "";
}

function flushQueue() {
  isProcessing = false;
  updateMeta({ status: "idle" });
  if (messageQueue.length > 0) {
    const next = messageQueue.shift();
    handleUserMessage(next.text, next.sessionId);
  }
}

function emitResult({ text = "", isError = false }) {
  pendingEvents = [];
  accumulatedText = "";
  emit({
    type: "result",
    text,
    sessionId: currentSessionId,
    isError,
    permissionDenials: [],
  });
  updateMeta({ status: "idle", providerSessionId: currentSessionId });
}

function resolveCodexBinary() {
  const candidates = [];
  const fromPath = spawnSync("bash", ["-lc", "command -v codex 2>/dev/null || true"], { encoding: "utf-8" }).stdout.trim();
  if (fromPath) candidates.push(fromPath);
  const npmPrefix = spawnSync("bash", ["-lc", "npm prefix -g 2>/dev/null || true"], { encoding: "utf-8" }).stdout.trim();
  if (npmPrefix) candidates.push(`${npmPrefix}/bin/codex`);
  candidates.push(
    `${process.env.HOME}/.local/bin/codex`,
    `${process.env.HOME}/.npm-global/bin/codex`,
  );

  const nvmRoot = `${process.env.HOME}/.nvm/versions/node`;
  const nvmEntries = spawnSync("bash", ["-lc", `ls -1d ${nvmRoot}/*/bin/codex 2>/dev/null || true`], { encoding: "utf-8" }).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  candidates.push(...nvmEntries, "/usr/local/bin/codex");

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf-8" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function nextRpcId() {
  return codexRpcId++;
}

function codexNotify(method, params = {}) {
  if (!codexServer) return;
  const msg = { jsonrpc: "2.0", method, params };
  log(`CODEX NOTIFY: ${JSON.stringify(msg)}`);
  codexServer.stdin.write(`${JSON.stringify(msg)}\n`);
}

function codexRequest(method, params = {}) {
  if (!codexServer) return Promise.reject(new Error("Codex app-server not running"));
  const id = nextRpcId();
  const msg = { jsonrpc: "2.0", id, method, params };
  log(`CODEX REQ: ${JSON.stringify(msg)}`);
  codexServer.stdin.write(`${JSON.stringify(msg)}\n`);
  return new Promise((resolve, reject) => {
    codexPending.set(id, { resolve, reject, method });
  });
}

function makeCodexSandboxPolicy(mode) {
  if (mode === "plan") {
    return {
      type: "readOnly",
      access: { type: "fullAccess" },
      networkAccess: false,
    };
  }

  return {
    type: "workspaceWrite",
    writableRoots: [`${process.env.HOME}/.codex/memories`],
    readOnlyAccess: { type: "fullAccess" },
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function makeCodexApprovalPolicy(mode) {
  if (mode === "acceptEdits") return "never";
  if (mode === "plan") return "never";
  return "on-request";
}

function mapCodexEffort(effort) {
  if (!effort) return null;
  if (effort === "max") return "xhigh";
  return effort;
}

async function ensureCodexServer() {
  if (codexInitialized && codexServer) return;
  const codexBin = resolveCodexBinary();
  if (!codexBin) throw new Error("Codex binary not found");

  codexServer = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ""}` },
  });
  codexServer.stdout.setEncoding("utf8");
  codexServer.stderr.setEncoding("utf8");

  codexServer.stdout.on("data", (chunk) => {
    codexBuffer += chunk;
    const lines = codexBuffer.split("\n");
    codexBuffer = lines.pop() || "";
    for (const line of lines) handleCodexWireMessage(line);
  });

  codexServer.stderr.on("data", (chunk) => {
    log(`CODEX-ERR: ${String(chunk).trim()}`);
  });

  codexServer.on("error", (err) => {
    emit({ type: "error", message: err.message || "Codex app-server failed" });
  });

  codexServer.on("close", (code) => {
    log(`CODEX CLOSE: ${code ?? "null"}`);
    codexInitialized = false;
    codexServer = null;
    if (isProcessing) {
      emit({ type: "error", message: `Codex app-server exited with code ${code ?? "unknown"}` });
    }
  });

  await codexRequest("initialize", {
    clientInfo: { name: "claw-ops-chat-bridge", version: "1.0.0" },
    capabilities: { experimentalApi: true },
  });
  codexNotify("initialized");
  codexInitialized = true;

  let result;
  if (resumeSessionId) {
    result = await codexRequest("thread/resume", {
      threadId: resumeSessionId,
      approvalPolicy: makeCodexApprovalPolicy(currentPermissionMode),
      sandbox: currentPermissionMode === "plan" ? "read-only" : "workspace-write",
      cwd: process.env.HOME || ".",
    });
  } else {
    result = await codexRequest("thread/start", {
      cwd: process.env.HOME || ".",
      approvalPolicy: makeCodexApprovalPolicy(currentPermissionMode),
      sandbox: currentPermissionMode === "plan" ? "read-only" : "workspace-write",
      personality: "pragmatic",
    });
  }

  const threadId = result?.thread?.id;
  if (!threadId) throw new Error("Codex did not return a thread id");
  codexThreadId = threadId;
  currentSessionId = threadId;
  emit({ type: "session_init", sessionId: threadId });
  updateMeta({ providerSessionId: threadId });
}

function respondToCodexApproval(id, allow, allowSession) {
  const req = codexApprovalRequests.get(id);
  if (!req || !codexServer) return;
  codexApprovalRequests.delete(id);

  let result;
  if (req.method === "item/permissions/requestApproval") {
    result = allow
      ? {
          permissions: req.params.permissions ?? {},
          scope: allowSession ? "session" : "turn",
        }
      : { permissions: {}, scope: "turn" };
  } else if (req.method === "item/fileChange/requestApproval") {
    result = { decision: allow ? (allowSession ? "acceptForSession" : "accept") : "decline" };
  } else {
    result = { decision: allow ? (allowSession ? "acceptForSession" : "accept") : "decline" };
  }

  const msg = { jsonrpc: "2.0", id: req.rpcId, result };
  log(`CODEX RESP: ${JSON.stringify(msg)}`);
  codexServer.stdin.write(`${JSON.stringify(msg)}\n`);
}

function handleCodexServerRequest(msg) {
  const method = msg.method;
  const params = msg.params || {};
  const requestId = String(msg.id);
  codexApprovalRequests.set(requestId, { rpcId: msg.id, method, params });

  if (method === "item/commandExecution/requestApproval") {
    emit({
      type: "permission_request",
      id: requestId,
      toolName: "Bash",
      input: {
        command: params.command || "",
        cwd: params.cwd || null,
      },
      description: params.reason || params.command || "Command approval required",
    });
    emit({ type: "status", status: "awaiting_permission" });
    updateMeta({ status: "awaiting_permission" });
    return;
  }

  if (method === "item/fileChange/requestApproval") {
    emit({
      type: "permission_request",
      id: requestId,
      toolName: "Write",
      input: {
        file_path: params.grantRoot || "(file changes pending)",
      },
      description: params.reason || params.grantRoot || "File change approval required",
    });
    emit({ type: "status", status: "awaiting_permission" });
    updateMeta({ status: "awaiting_permission" });
    return;
  }

  if (method === "item/permissions/requestApproval") {
    emit({
      type: "permission_request",
      id: requestId,
      toolName: "Bash",
      input: params.permissions || {},
      description: params.reason || "Additional permissions required",
    });
    emit({ type: "status", status: "awaiting_permission" });
    updateMeta({ status: "awaiting_permission" });
    return;
  }

  if (method === "item/tool/requestUserInput") {
    emit({
      type: "ask_question",
      id: requestId,
      questions: (params.questions || []).map((question) => ({
        header: question.header,
        question: question.question,
        options: question.options || [],
        multiSelect: false,
      })),
    });
    emit({ type: "status", status: "awaiting_input" });
    updateMeta({ status: "awaiting_input" });
    return;
  }

  const fallback = { jsonrpc: "2.0", id: msg.id, result: {} };
  codexServer.stdin.write(`${JSON.stringify(fallback)}\n`);
}

function handleCodexNotification(msg) {
  const method = msg.method;
  const params = msg.params || {};

  if (method === "thread/started") {
    const threadId = params.thread?.id;
    if (threadId) {
      codexThreadId = threadId;
      currentSessionId = threadId;
      emit({ type: "session_init", sessionId: threadId });
      updateMeta({ providerSessionId: threadId });
    }
    return;
  }

  if (method === "thread/status/changed") {
    const status = params.status;
    if (status?.type === "idle") {
      emit({ type: "status", status: "idle" });
    } else if (status?.type === "active") {
      if (Array.isArray(status.activeFlags) && status.activeFlags.includes("waitingOnApproval")) {
        emit({ type: "status", status: "awaiting_permission" });
      } else if (Array.isArray(status.activeFlags) && status.activeFlags.includes("waitingOnUserInput")) {
        emit({ type: "status", status: "awaiting_input" });
      } else if (codexCurrentToolId) {
        emit({ type: "status", status: "tool_running" });
      } else {
        emit({ type: "status", status: "thinking" });
      }
    } else if (status?.type === "systemError") {
      emit({ type: "error", message: "Codex thread entered an error state" });
    }
    return;
  }

  if (method === "turn/started") {
    emit({ type: "status", status: "thinking" });
    updateMeta({ status: "running" });
    return;
  }

  if (method === "item/agentMessage/delta") {
    accumulatedText += params.delta || "";
    emit({ type: "text_delta", text: params.delta || "" });
    return;
  }

  if (method === "item/started") {
    const item = params.item || {};
    if (item.type === "commandExecution") {
      codexCurrentToolId = item.id;
      emit({
        type: "tool_use_start",
        id: item.id,
        name: "Bash",
        input: {
          command: item.command || "",
          cwd: item.cwd || null,
        },
      });
      emit({ type: "status", status: "tool_running" });
    }
    return;
  }

  if (method === "item/completed") {
    const item = params.item || {};

    if (item.type === "agentMessage") {
      if (item.text && item.text !== accumulatedText) {
        accumulatedText = item.text;
        emit({ type: "text_snapshot", text: item.text });
      }
      return;
    }

    if (item.type === "commandExecution") {
      emit({
        type: "tool_use_complete",
        id: item.id,
        name: "Bash",
        input: {
          command: item.command || "",
          cwd: item.cwd || null,
        },
      });
      emit({
        type: "tool_result",
        id: item.id,
        content: item.aggregatedOutput || (item.status === "declined" ? "Command declined" : ""),
        isError: item.status === "failed" || item.status === "declined" || (item.exitCode || 0) !== 0,
      });
      codexCurrentToolId = null;
      emit({ type: "status", status: "thinking" });
    }
    return;
  }

  if (method === "turn/completed") {
    codexCurrentToolId = null;
    const turn = params.turn || {};
    const failed = turn.status === "failed";
    const errMsg = failed
      ? typeof turn.error === "string"
        ? turn.error
        : JSON.stringify(turn.error || {})
      : "";
    emitResult({ text: errMsg, isError: failed });
    flushQueue();
    return;
  }

  if (method === "error") {
    const message = params?.message || params?.summary || "Codex app-server error";
    emit({ type: "error", message });
    if (isProcessing) flushQueue();
    return;
  }
}

function handleCodexWireMessage(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  log(`CODEX: ${trimmed}`);
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(msg, "id") && Object.prototype.hasOwnProperty.call(msg, "result")) {
    const pending = codexPending.get(msg.id);
    if (pending) {
      codexPending.delete(msg.id);
      pending.resolve(msg.result);
    }
    return;
  }

  if (Object.prototype.hasOwnProperty.call(msg, "id") && msg.error) {
    const pending = codexPending.get(msg.id);
    if (pending) {
      codexPending.delete(msg.id);
      pending.reject(new Error(msg.error.message || "Codex JSON-RPC error"));
    }
    return;
  }

  if (Object.prototype.hasOwnProperty.call(msg, "id") && msg.method) {
    handleCodexServerRequest(msg);
    return;
  }

  if (msg.method) {
    handleCodexNotification(msg);
  }
}

async function handleClaudeMessage(text, resumeId) {
  let toolInputAccum = "";
  let pendingToolUse = null;

  const queryOptions = {
    includePartialMessages: true,
    canUseTool: async (toolName, input) => {
      if (toolName === "AskUserQuestion") {
        const id = `req-${++requestCounter}`;
        emit({ type: "ask_question", id, questions: input.questions || [] });
        emit({ type: "status", status: "awaiting_input" });
        updateMeta({ status: "awaiting_input" });
        const response = await waitForResponse(id);
        emit({ type: "status", status: "thinking" });
        updateMeta({ status: "running" });
        return {
          behavior: "allow",
          updatedInput: { questions: input.questions || [], answers: response.answers || {} },
        };
      }

      if (sessionAllowedTools.has(toolName)) {
        return { behavior: "allow", updatedInput: input };
      }

      const id = `req-${++requestCounter}`;
      emit({
        type: "permission_request",
        id,
        toolName,
        input,
        description: getToolDescription(toolName, input),
      });
      emit({ type: "status", status: "awaiting_permission" });
      updateMeta({ status: "awaiting_permission" });
      const response = await waitForResponse(id);
      emit({ type: "status", status: "tool_running" });
      updateMeta({ status: "running" });

      if (response.allow) {
        if (response.allowSession) sessionAllowedTools.add(toolName);
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: response.message || "User denied this action" };
    },
    permissionMode: currentPermissionMode,
    allowDangerouslySkipPermissions: currentPermissionMode === "bypassPermissions",
    ...(currentEffort ? { effort: currentEffort } : {}),
  };

  const queryParams = { prompt: text, options: queryOptions };
  if (resumeId) {
    queryParams.options.resume = resumeId;
  } else if (currentSessionId) {
    queryParams.options.resume = currentSessionId;
  }

  for await (const message of query(queryParams)) {
    if (message.type === "system" && message.subtype === "init") {
      currentSessionId = message.session_id;
      emit({ type: "session_init", sessionId: message.session_id });
      updateMeta({ providerSessionId: message.session_id });
      continue;
    }

    if (message.type === "stream_event") {
      const event = message.event;
      if (!event) continue;

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        accumulatedText += event.delta.text;
        emit({ type: "text_delta", text: event.delta.text });
        continue;
      }

      if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
        emit({ type: "thinking_delta", text: event.delta.thinking });
        continue;
      }

      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        toolInputAccum = "";
        pendingToolUse = { id: event.content_block.id, name: event.content_block.name };
        continue;
      }

      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
        toolInputAccum += event.delta.partial_json;
        continue;
      }

      if (event.type === "content_block_stop") {
        if (pendingToolUse) {
          let parsedInput = {};
          try { parsedInput = JSON.parse(toolInputAccum); } catch {}
          emit({ type: "tool_use_start", id: pendingToolUse.id, name: pendingToolUse.name, input: parsedInput });
          pendingToolUse = null;
          toolInputAccum = "";
        }
      }
      continue;
    }

    if (message.type === "user" && message.message?.content) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === "tool_result") {
            const resultContent = typeof item.content === "string"
              ? item.content
              : Array.isArray(item.content) ? item.content.map((c) => c.text || "").join("") : "";
            emit({ type: "tool_result", id: item.tool_use_id, content: resultContent, isError: item.is_error || false });
          }
        }
      }
      continue;
    }

    if (message.type === "assistant") {
      if (message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            emit({ type: "tool_use_complete", id: block.id, name: block.name, input: block.input });
          }
        }
      }
      continue;
    }

    if (message.type === "result") {
      currentSessionId = message.session_id;
      emitResult({
        text: message.result || "",
        isError: message.is_error || false,
      });
    }
  }
}

async function handleCodexMessage(text) {
  await ensureCodexServer();
  await codexRequest("turn/start", {
    threadId: codexThreadId,
    input: [{ type: "text", text }],
    approvalPolicy: makeCodexApprovalPolicy(currentPermissionMode),
    sandboxPolicy: makeCodexSandboxPolicy(currentPermissionMode),
    effort: mapCodexEffort(currentEffort),
    cwd: process.env.HOME || ".",
    personality: "pragmatic",
  });

  emit({ type: "status", status: "thinking" });
  updateMeta({ status: "running", providerSessionId: codexThreadId });
}

async function handleUserMessage(text, resumeId) {
  isProcessing = true;
  updateMeta({ status: "running" });

  try {
    if (provider === "codex") {
      await handleCodexMessage(text);
    } else {
      await handleClaudeMessage(text, resumeId);
      flushQueue();
    }
  } catch (err) {
    pendingEvents = [];
    accumulatedText = "";
    emit({ type: "error", message: err.message || "Unknown error" });
    updateMeta({ status: "error" });
    flushQueue();
  }
}

function processIncomingMessage(msg) {
  if (msg.type === "poll") {
    if (!isBackground) {
      if (accumulatedText) {
        writeSync(1, `${JSON.stringify({ type: "text_snapshot", text: accumulatedText })}\n`);
      }
      for (const evt of pendingEvents) {
        writeSync(1, `${JSON.stringify(evt)}\n`);
      }
    }
    return;
  }

  if (msg.type === "permission_response" || msg.type === "ask_response") {
    pendingEvents = [];
    accumulatedText = "";

    if (provider === "codex") {
      if (msg.type === "permission_response") {
        respondToCodexApproval(msg.id, !!msg.allow, !!msg.allowSession);
      } else {
        const req = codexApprovalRequests.get(msg.id);
        if (req && codexServer) {
          codexApprovalRequests.delete(msg.id);
          const answers = {};
          for (const [key, value] of Object.entries(msg.answers || {})) {
            answers[key] = { answers: [value] };
          }
          const response = { jsonrpc: "2.0", id: req.rpcId, result: { answers } };
          codexServer.stdin.write(`${JSON.stringify(response)}\n`);
        }
      }
      return;
    }

    const resolver = pendingRequests.get(msg.id);
    if (resolver) {
      resolver(msg);
      pendingRequests.delete(msg.id);
    }
    return;
  }

  if (msg.type === "set_effort") {
    currentEffort = msg.effort || null;
    emit({ type: "effort_changed", effort: currentEffort });
    return;
  }

  if (msg.type === "set_mode") {
    currentPermissionMode = msg.mode || "default";
    emit({ type: "mode_changed", mode: currentPermissionMode });
    return;
  }

  if (msg.type === "message") {
    if (isProcessing) {
      messageQueue.push({ text: msg.text, sessionId: msg.sessionId });
    } else {
      handleUserMessage(msg.text, msg.sessionId);
    }
    return;
  }

  if (msg.type === "stop") {
    updateMeta({ status: "stopped" });
    process.exit(0);
  }
}

if (!isBackground) {
  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { return; }
    processIncomingMessage(msg);
  });

  rl.on("close", () => { process.exit(0); });

  if (provider === "codex") {
    ensureCodexServer()
      .then(() => emit({ type: "ready" }))
      .catch((err) => emit({ type: "error", message: err.message || "Failed to initialize Codex" }));
  } else {
    setTimeout(() => emit({ type: "ready" }), 100);
  }
}

if (isBackground && SESSION_DIR) {
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(`${SESSION_DIR}/pid`, String(process.pid));
  if (!existsSync(`${SESSION_DIR}/input.jsonl`)) writeFileSync(`${SESSION_DIR}/input.jsonl`, "");
  if (!existsSync(`${SESSION_DIR}/output.jsonl`)) writeFileSync(`${SESSION_DIR}/output.jsonl`, "");

  updateMeta({
    sessionId,
    startedAt: Date.now(),
    status: "idle",
    provider,
    providerSessionId: currentSessionId,
  });

  const ready = provider === "codex"
    ? ensureCodexServer().then(() => emit({ type: "ready" }))
    : Promise.resolve().then(() => emit({ type: "ready" }));

  ready.catch((err) => emit({ type: "error", message: err.message || "Failed to initialize bridge" }));

  let lastInputLine = 0;
  setInterval(() => {
    try {
      const content = readFileSync(`${SESSION_DIR}/input.jsonl`, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      for (let i = lastInputLine; i < lines.length; i++) {
        try {
          const msg = JSON.parse(lines[i]);
          processIncomingMessage(msg);
        } catch {}
      }
      lastInputLine = lines.length;
    } catch {}
  }, 200);

  setInterval(() => {
    updateMeta({});
  }, 30000);
}
