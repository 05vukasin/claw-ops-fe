#!/usr/bin/env node

/**
 * ClawOps Chat Bridge
 *
 * Long-running process that wraps the Claude Agent SDK.
 * Communicates via stdin/stdout JSON lines with the frontend
 * through a WebSocket terminal connection.
 *
 * stdin:  user messages, permission responses, question answers
 * stdout: streaming text, tool use, permission requests, results
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

const pendingRequests = new Map();
let requestCounter = 0;
let currentSessionId = null;
let isProcessing = false;
const messageQueue = [];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
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

async function handleUserMessage(text, resumeSessionId) {
  isProcessing = true;

  const queryOptions = {
    includePartialMessages: true,
    canUseTool: async (toolName, input, options) => {
      // Handle AskUserQuestion
      if (toolName === "AskUserQuestion") {
        const id = `req-${++requestCounter}`;
        emit({ type: "ask_question", id, questions: input.questions || [] });
        emit({ type: "status", status: "awaiting_input" });
        const response = await waitForResponse(id);
        emit({ type: "status", status: "thinking" });
        return {
          behavior: "allow",
          updatedInput: {
            questions: input.questions || [],
            answers: response.answers || {},
          },
        };
      }

      // Permission request for other tools
      const id = `req-${++requestCounter}`;
      const description = getToolDescription(toolName, input);
      emit({ type: "permission_request", id, toolName, input, description });
      emit({ type: "status", status: "awaiting_permission" });
      const response = await waitForResponse(id);
      emit({ type: "status", status: "tool_running" });

      if (response.allow) {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: response.message || "User denied this action" };
    },
    permissionMode: "default",
  };

  // Build the prompt — for resume, pass session ID
  const queryParams = { prompt: text, options: queryOptions };
  if (resumeSessionId) {
    queryParams.options.resume = resumeSessionId;
  } else if (currentSessionId) {
    queryParams.options.resume = currentSessionId;
  }

  try {
    for await (const message of query(queryParams)) {
      // System init
      if (message.type === "system" && message.subtype === "init") {
        currentSessionId = message.session_id;
        emit({ type: "session_init", sessionId: message.session_id });
        continue;
      }

      // Streaming events
      if (message.type === "stream_event") {
        const event = message.event;
        if (!event) continue;

        // Text delta
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          emit({ type: "text_delta", text: event.delta.text });
          continue;
        }

        // Thinking delta
        if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
          emit({ type: "thinking_delta", text: event.delta.thinking });
          continue;
        }

        // Tool use start
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          emit({
            type: "tool_use_start",
            id: event.content_block.id,
            name: event.content_block.name,
          });
          continue;
        }

        // Tool input delta
        if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
          emit({ type: "tool_input_delta", json: event.delta.partial_json });
          continue;
        }

        // Content block stop
        if (event.type === "content_block_stop") {
          emit({ type: "content_block_stop", index: event.index });
          continue;
        }

        continue;
      }

      // Tool result (user event with tool_result)
      if (message.type === "user" && message.message?.content) {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === "tool_result") {
              const resultContent = typeof item.content === "string"
                ? item.content
                : Array.isArray(item.content)
                  ? item.content.map((c) => c.text || "").join("")
                  : "";
              emit({
                type: "tool_result",
                id: item.tool_use_id,
                content: resultContent,
                isError: item.is_error || false,
              });
            }
          }
        }
        continue;
      }

      // Full assistant message
      if (message.type === "assistant") {
        // Extract any tool_use blocks we might have missed in streaming
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              emit({
                type: "tool_use_complete",
                id: block.id,
                name: block.name,
                input: block.input,
              });
            }
          }
        }
        continue;
      }

      // Result — turn complete
      if (message.type === "result") {
        currentSessionId = message.session_id;
        emit({
          type: "result",
          text: message.result || "",
          sessionId: message.session_id,
          isError: message.is_error || false,
          permissionDenials: message.permission_denials || [],
        });
        continue;
      }
    }
  } catch (err) {
    emit({ type: "error", message: err.message || "Unknown error" });
  }

  isProcessing = false;

  // Process any queued messages
  if (messageQueue.length > 0) {
    const next = messageQueue.shift();
    handleUserMessage(next.text, next.sessionId);
  }
}

/* ------------------------------------------------------------------ */
/*  Stdin reader                                                       */
/* ------------------------------------------------------------------ */

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // Ignore non-JSON input
  }

  // Permission or question response
  if (msg.type === "permission_response" || msg.type === "ask_response") {
    const resolver = pendingRequests.get(msg.id);
    if (resolver) {
      resolver(msg);
      pendingRequests.delete(msg.id);
    }
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
});

rl.on("close", () => {
  process.exit(0);
});

/* ------------------------------------------------------------------ */
/*  Signal ready                                                       */
/* ------------------------------------------------------------------ */

emit({ type: "ready" });
