#!/usr/bin/env node

/**
 * ClawOps Chat Bridge
 *
 * Wraps the Claude Agent SDK for programmatic chat.
 *
 * Two modes:
 *   1. Terminal mode (default): reads stdin, writes stdout — used with WebSocket terminal
 *   2. Background mode (--background --id ID): reads/writes files in ~/.claw-sessions/{ID}/
 *      Survives disconnection, supports multiple concurrent sessions.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";
import { appendFileSync, writeSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

/* ------------------------------------------------------------------ */
/*  Parse CLI args                                                     */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const bgIndex = args.indexOf("--background");
const idIndex = args.indexOf("--id");
const isBackground = bgIndex !== -1;
const sessionId = idIndex !== -1 ? args[idIndex + 1] : null;

const SESSION_DIR = sessionId ? `${process.env.HOME}/.claw-sessions/${sessionId}` : null;

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

const pendingRequests = new Map();
let requestCounter = 0;
let currentSessionId = null;
let isProcessing = false;
const messageQueue = [];
let pendingEvents = [];
const sessionAllowedTools = new Set();
let currentPermissionMode = "default";
let currentEffort = null;
let accumulatedText = "";

/* ------------------------------------------------------------------ */
/*  I/O abstraction — terminal vs background                           */
/* ------------------------------------------------------------------ */

const LOG_FILE = isBackground && SESSION_DIR
  ? `${SESSION_DIR}/bridge.log`
  : "/tmp/claw-bridge.log";

function log(msg) {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

function emit(obj) {
  const line = JSON.stringify(obj) + "\n";
  log(`EMIT: ${line.trim()}`);

  if (isBackground && SESSION_DIR) {
    // Background mode: append to output file
    try { appendFileSync(`${SESSION_DIR}/output.jsonl`, line); } catch {}
  } else {
    // Terminal mode: write to stdout
    writeSync(1, line);
  }

  if (obj.type === "permission_request" || obj.type === "ask_question" ||
      obj.type === "tool_use_start" || obj.type === "tool_result" ||
      obj.type === "result") {
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

/* ------------------------------------------------------------------ */
/*  Handle a single user message turn                                  */
/* ------------------------------------------------------------------ */

async function handleUserMessage(text, resumeClaudeSessionId) {
  isProcessing = true;
  updateMeta({ status: "running" });
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
        log(`AUTO-ALLOW: ${toolName} (session-allowed)`);
        return { behavior: "allow", updatedInput: input };
      }

      const id = `req-${++requestCounter}`;
      const description = getToolDescription(toolName, input);
      emit({ type: "permission_request", id, toolName, input, description });
      emit({ type: "status", status: "awaiting_permission" });
      updateMeta({ status: "awaiting_permission" });
      const response = await waitForResponse(id);
      emit({ type: "status", status: "tool_running" });
      updateMeta({ status: "running" });

      if (response.allow) {
        if (response.allowSession) {
          sessionAllowedTools.add(toolName);
          log(`SESSION-ALLOW: ${toolName} added to session allowlist`);
        }
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: response.message || "User denied this action" };
    },
    permissionMode: currentPermissionMode,
    allowDangerouslySkipPermissions: currentPermissionMode === "bypassPermissions",
    ...(currentEffort ? { effort: currentEffort } : {}),
  };

  const queryParams = { prompt: text, options: queryOptions };
  if (resumeClaudeSessionId) {
    queryParams.options.resume = resumeClaudeSessionId;
  } else if (currentSessionId) {
    queryParams.options.resume = currentSessionId;
  }

  try {
    for await (const message of query(queryParams)) {
      if (message.type === "system" && message.subtype === "init") {
        currentSessionId = message.session_id;
        emit({ type: "session_init", sessionId: message.session_id });
        updateMeta({ claudeSessionId: message.session_id });
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
          continue;
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
        pendingEvents = []; accumulatedText = "";
        emit({
          type: "result",
          text: message.result || "",
          sessionId: message.session_id,
          isError: message.is_error || false,
          permissionDenials: message.permission_denials || [],
        });
        updateMeta({ status: "idle", claudeSessionId: message.session_id });
        continue;
      }
    }
  } catch (err) {
    pendingEvents = []; accumulatedText = "";
    emit({ type: "error", message: err.message || "Unknown error" });
    updateMeta({ status: "error" });
  }

  isProcessing = false;
  updateMeta({ status: "idle" });

  if (messageQueue.length > 0) {
    const next = messageQueue.shift();
    handleUserMessage(next.text, next.sessionId);
  }
}

/* ------------------------------------------------------------------ */
/*  Process incoming message (shared by both modes)                     */
/* ------------------------------------------------------------------ */

function processIncomingMessage(msg) {
  // Poll
  if (msg.type === "poll") {
    if (!isBackground) {
      // Terminal mode: re-emit to stdout
      if (accumulatedText) {
        writeSync(1, JSON.stringify({ type: "text_snapshot", text: accumulatedText }) + "\n");
      }
      for (const evt of pendingEvents) {
        writeSync(1, JSON.stringify(evt) + "\n");
      }
    }
    return;
  }

  // Permission or question response
  if (msg.type === "permission_response" || msg.type === "ask_response") {
    pendingEvents = []; accumulatedText = "";
    const resolver = pendingRequests.get(msg.id);
    if (resolver) { resolver(msg); pendingRequests.delete(msg.id); }
    return;
  }

  // Effort change
  if (msg.type === "set_effort") {
    currentEffort = msg.effort || null;
    log(`EFFORT: changed to ${currentEffort}`);
    emit({ type: "effort_changed", effort: currentEffort });
    return;
  }

  // Mode change
  if (msg.type === "set_mode") {
    currentPermissionMode = msg.mode || "default";
    log(`MODE: changed to ${currentPermissionMode}`);
    emit({ type: "mode_changed", mode: currentPermissionMode });
    return;
  }

  // User message
  if (msg.type === "message") {
    if (isProcessing) {
      messageQueue.push({ text: msg.text, sessionId: msg.sessionId });
    } else {
      handleUserMessage(msg.text, msg.sessionId);
    }
    return;
  }

  // Stop command
  if (msg.type === "stop") {
    log("STOP received, exiting.");
    updateMeta({ status: "stopped" });
    process.exit(0);
  }
}

/* ------------------------------------------------------------------ */
/*  MODE: Terminal (default) — stdin/stdout                            */
/* ------------------------------------------------------------------ */

if (!isBackground) {
  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    log(`RECV: ${trimmed}`);
    let msg;
    try { msg = JSON.parse(trimmed); } catch { log(`SKIP non-JSON: ${trimmed.slice(0, 100)}`); return; }
    processIncomingMessage(msg);
  });

  rl.on("close", () => { process.exit(0); });

  setTimeout(() => emit({ type: "ready" }), 100);
}

/* ------------------------------------------------------------------ */
/*  MODE: Background — file-based IPC                                  */
/* ------------------------------------------------------------------ */

if (isBackground && SESSION_DIR) {
  // Create session directory
  mkdirSync(SESSION_DIR, { recursive: true });

  // Write PID
  writeFileSync(`${SESSION_DIR}/pid`, String(process.pid));

  // Initialize files
  if (!existsSync(`${SESSION_DIR}/input.jsonl`)) writeFileSync(`${SESSION_DIR}/input.jsonl`, "");
  if (!existsSync(`${SESSION_DIR}/output.jsonl`)) writeFileSync(`${SESSION_DIR}/output.jsonl`, "");

  // Write initial meta
  updateMeta({
    sessionId,
    startedAt: Date.now(),
    status: "idle",
    claudeSessionId: null,
  });

  emit({ type: "ready" });

  // Poll input file for new lines
  let lastInputLine = 0;

  setInterval(() => {
    try {
      const content = readFileSync(`${SESSION_DIR}/input.jsonl`, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      for (let i = lastInputLine; i < lines.length; i++) {
        log(`RECV-BG: ${lines[i]}`);
        try {
          const msg = JSON.parse(lines[i]);
          processIncomingMessage(msg);
        } catch {
          log(`SKIP-BG non-JSON: ${lines[i].slice(0, 100)}`);
        }
      }
      lastInputLine = lines.length;
    } catch {}
  }, 200);

  // Keep process alive
  setInterval(() => {
    updateMeta({});  // Touch lastActivity
  }, 30000);

  log(`Background bridge started for session ${sessionId} (PID ${process.pid})`);
}
