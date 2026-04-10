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

const LOG_FILE = isBackground && SESSION_DIR
  ? `${SESSION_DIR}/bridge.log`
  : "/tmp/claw-bridge.log";

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

async function handleCodexMessage(text, resumeId) {
  const codexBin = resolveCodexBinary();
  if (!codexBin) throw new Error("Codex binary not found");

  const commandArgs = [];
  if (resumeId || currentSessionId) {
    commandArgs.push("exec", "resume", "--json", resumeId || currentSessionId, text);
  } else {
    commandArgs.push("exec", "--json", text);
  }
  commandArgs.push("--skip-git-repo-check", "--sandbox", "workspace-write", "--cd", process.env.HOME || ".");

  emit({ type: "status", status: "thinking" });
  updateMeta({ status: "running" });

  await new Promise((resolve, reject) => {
    let activeCommand = null;
    const child = spawn(codexBin, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ""}` },
    });

    const parseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      log(`CODEX: ${trimmed}`);
      let evt;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        return;
      }

      if (evt.type === "thread.started" && evt.thread_id) {
        currentSessionId = evt.thread_id;
        emit({ type: "session_init", sessionId: evt.thread_id });
        updateMeta({ providerSessionId: evt.thread_id });
        return;
      }

      if (evt.type === "turn.started") {
        emit({ type: "status", status: "thinking" });
        return;
      }

      if (evt.type === "item.started" && evt.item?.type === "command_execution") {
        activeCommand = evt.item;
        emit({
          type: "tool_use_start",
          id: evt.item.id,
          name: "Bash",
          input: { command: evt.item.command || "" },
        });
        emit({ type: "status", status: "tool_running" });
        return;
      }

      if (evt.type === "item.completed" && evt.item?.type === "command_execution") {
        activeCommand = null;
        emit({
          type: "tool_use_complete",
          id: evt.item.id,
          name: "Bash",
          input: { command: evt.item.command || "" },
        });
        emit({
          type: "tool_result",
          id: evt.item.id,
          content: evt.item.aggregated_output || "",
          isError: (evt.item.exit_code || 0) !== 0,
        });
        emit({ type: "status", status: "thinking" });
        return;
      }

      if (evt.type === "item.completed" && evt.item?.type === "agent_message") {
        const message = evt.item.text || "";
        if (message) {
          accumulatedText = message;
          emit({ type: "text_snapshot", text: message });
        }
        return;
      }

      if (evt.type === "turn.completed") {
        if (activeCommand) activeCommand = null;
        emitResult({ text: "", isError: false });
      }
    };

    let stdoutBuffer = "";
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) parseLine(line);
    });

    child.stderr.on("data", (chunk) => {
      log(`CODEX-ERR: ${String(chunk).trim()}`);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (stdoutBuffer.trim()) parseLine(stdoutBuffer);
      if (code && code !== 0) {
        reject(new Error(`Codex exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function handleUserMessage(text, resumeId) {
  isProcessing = true;
  updateMeta({ status: "running" });

  try {
    if (provider === "codex") {
      await handleCodexMessage(text, resumeId);
    } else {
      await handleClaudeMessage(text, resumeId);
    }
  } catch (err) {
    pendingEvents = [];
    accumulatedText = "";
    emit({ type: "error", message: err.message || "Unknown error" });
    updateMeta({ status: "error" });
  }

  flushQueue();
}

function processIncomingMessage(msg) {
  if (msg.type === "poll") {
    if (!isBackground) {
      if (accumulatedText) {
        writeSync(1, JSON.stringify({ type: "text_snapshot", text: accumulatedText }) + "\n");
      }
      for (const evt of pendingEvents) {
        writeSync(1, JSON.stringify(evt) + "\n");
      }
    }
    return;
  }

  if (msg.type === "permission_response" || msg.type === "ask_response") {
    pendingEvents = [];
    accumulatedText = "";
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
  setTimeout(() => emit({ type: "ready" }), 100);
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

  emit({ type: "ready" });

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
