"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FiTerminal,
  FiFile,
  FiEdit,
  FiChevronDown,
  FiChevronRight,
  FiCheck,
  FiX,
} from "react-icons/fi";
import type { ChatMessage } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Tool display mapping                                               */
/* ------------------------------------------------------------------ */

const TOOL_DISPLAY: Record<string, { icon: typeof FiTerminal; label: string }> = {
  Bash: { icon: FiTerminal, label: "Running command" },
  Read: { icon: FiFile, label: "Reading file" },
  Write: { icon: FiEdit, label: "Writing file" },
  Edit: { icon: FiEdit, label: "Editing file" },
  Glob: { icon: FiFile, label: "Searching files" },
  Grep: { icon: FiFile, label: "Searching content" },
  WebSearch: { icon: FiFile, label: "Searching web" },
  WebFetch: { icon: FiFile, label: "Fetching page" },
};

function getToolDisplay(name?: string) {
  if (!name) return { icon: FiTerminal, label: "Using tool" };
  return TOOL_DISPLAY[name] ?? { icon: FiTerminal, label: `Using ${name}` };
}

function extractToolDescription(toolName?: string, toolInput?: string): string {
  if (!toolInput) return "";
  try {
    const parsed = JSON.parse(toolInput);
    if (toolName === "Bash" && parsed.command) return parsed.command.slice(0, 80);
    if ((toolName === "Read" || toolName === "Write" || toolName === "Edit") && parsed.file_path) return parsed.file_path;
    if ((toolName === "Grep") && parsed.pattern) return parsed.pattern;
    if ((toolName === "Glob") && parsed.pattern) return parsed.pattern;
    return "";
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Markdown components for assistant messages                         */
/* ------------------------------------------------------------------ */

/* ── Detect Unicode box-drawing content ── */
const BOX_CHARS = /[┌┐└┘├┤┬┴┼─│═║╔╗╚╝╠╣╦╩╬]/;

function hasBoxDrawing(text: string): boolean {
  return BOX_CHARS.test(text);
}

/* ── Markdown components ── */
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1 text-[14px] leading-relaxed text-[#e6edf3]">{children}</p>
  ),
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded bg-[#0d1117] p-3 font-mono text-[12px] leading-relaxed text-[#e6edf3]">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-[#1c2128] px-1.5 py-0.5 font-mono text-[12px] text-[#e6edf3]">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-[#0d1117] border border-[#21262d]">{children}</pre>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold text-white">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1.5 ml-4 list-disc text-[14px] text-[#e6edf3]">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1.5 ml-4 list-decimal text-[14px] text-[#e6edf3]">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="my-0.5">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-[#21262d]">
      <table className="w-full text-[12px] text-[#e6edf3]">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b border-[#21262d] bg-[#161b22]">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-t border-[#21262d] px-3 py-1.5">{children}</td>
  ),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface MessageBubbleProps {
  message: ChatMessage;
  onPermissionRespond?: (id: string, allow: boolean, allowSession?: boolean) => void;
  onQuestionRespond?: (id: string, answers: Record<string, string>) => void;
}

export function MessageBubble({ message, onPermissionRespond, onQuestionRespond }: MessageBubbleProps) {
  /* ── Error ── */
  if (message.type === "error") {
    return (
      <div className="flex justify-center px-4 py-1.5">
        <span className="rounded-md bg-red-500/10 px-3 py-1.5 text-[12px] text-red-400">
          {message.content}
        </span>
      </div>
    );
  }

  /* ── User message ── */
  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1f6feb] px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-white">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  /* ── Tool use indicator ── */
  if (message.type === "tool_use") {
    return <ToolUseIndicator message={message} />;
  }

  /* ── Tool result ── */
  if (message.type === "tool_result") {
    return <ToolResultBlock message={message} />;
  }

  /* ── Thinking block ── */
  if (message.type === "thinking") {
    return <ThinkingBlock message={message} />;
  }

  /* ── Permission request ── */
  if (message.type === "permission_request") {
    return <PermissionRequestBlock message={message} onRespond={onPermissionRespond} />;
  }

  /* ── Ask question ── */
  if (message.type === "ask_question") {
    return <AskQuestionBlock message={message} onRespond={onQuestionRespond} />;
  }

  /* ── Assistant text (with markdown) ── */
  return (
    <div className="flex justify-start px-4 py-1.5">
      <div className="min-w-0 max-w-[90%]">
        {message.content ? (
          <AssistantTextContent content={message.content} />
        ) : (
          <span className="inline-block h-4 w-0.5 animate-pulse bg-gray-400" />
        )}
      </div>
    </div>
  );
}

/* ── Assistant text with mixed content support ── */
function AssistantTextContent({ content }: { content: string }) {
  if (!hasBoxDrawing(content)) {
    return (
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </Markdown>
    );
  }

  // Split into segments: box-drawing blocks vs regular text
  const lines = content.split("\n");
  const segments: Array<{ type: "text" | "box"; content: string }> = [];
  let current: { type: "text" | "box"; lines: string[] } | null = null;

  for (const line of lines) {
    const isBox = BOX_CHARS.test(line);
    const type = isBox ? "box" : "text";
    if (!current || current.type !== type) {
      if (current) segments.push({ type: current.type, content: current.lines.join("\n") });
      current = { type, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current) segments.push({ type: current.type, content: current.lines.join("\n") });

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "box" ? (
          <div key={i} className="my-2 overflow-x-auto rounded-md border border-[#21262d] bg-[#0d1117] p-3">
            <pre className="whitespace-pre font-mono text-[11px] leading-relaxed text-[#e6edf3]">
              {seg.content}
            </pre>
          </div>
        ) : (
          <Markdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {seg.content}
          </Markdown>
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool use indicator                                                 */
/* ------------------------------------------------------------------ */

function ToolUseIndicator({ message }: { message: ChatMessage }) {
  const { icon: Icon, label } = getToolDisplay(message.toolName);
  const desc = extractToolDescription(message.toolName, message.toolInput);

  return (
    <div className="px-4 py-1">
      <div className="flex items-center gap-2 rounded-md border-l-2 border-purple-500/50 bg-[#161b22] px-3 py-2">
        <Icon size={13} className="shrink-0 text-purple-400" />
        <span className="text-[12px] font-medium text-purple-300">{label}</span>
        {desc && (
          <span className="line-clamp-1 min-w-0 flex-1 font-mono text-[11px] text-gray-500">
            {desc}
          </span>
        )}
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-purple-400" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool result (collapsible)                                          */
/* ------------------------------------------------------------------ */

function ToolResultBlock({ message }: { message: ChatMessage }) {
  const [collapsed, setCollapsed] = useState(true);
  const isError = message.isError ?? false;
  const accentColor = isError ? "border-red-500/50" : "border-green-500/50";
  const StatusIcon = isError ? FiX : FiCheck;
  const statusColor = isError ? "text-red-400" : "text-green-400";
  const statusLabel = isError ? "Error" : "Completed";

  // Don't show empty successful results
  if (!isError && !message.content.trim()) return null;

  return (
    <div className="px-4 py-1">
      <div className={`rounded-md border-l-2 ${accentColor} bg-[#161b22]`}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <StatusIcon size={12} className={`shrink-0 ${statusColor}`} />
          <span className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
          <span className="flex-1" />
          {collapsed ? (
            <FiChevronRight size={12} className="shrink-0 text-gray-600" />
          ) : (
            <FiChevronDown size={12} className="shrink-0 text-gray-600" />
          )}
        </button>
        {!collapsed && message.content && (
          <pre className="max-h-[200px] overflow-y-auto border-t border-[#21262d] px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-400">
            {message.content.slice(0, 2000)}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Thinking block (collapsible)                                       */
/* ------------------------------------------------------------------ */

function ThinkingBlock({ message }: { message: ChatMessage }) {
  const [collapsed, setCollapsed] = useState(true);

  if (!message.content) return null;

  return (
    <div className="px-4 py-1">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left active:bg-white/5"
      >
        {collapsed ? (
          <FiChevronRight size={10} className="shrink-0 text-gray-600" />
        ) : (
          <FiChevronDown size={10} className="shrink-0 text-gray-600" />
        )}
        <span className="text-[11px] text-gray-600">Thinking</span>
      </button>
      {!collapsed && (
        <div className="ml-2 max-h-[300px] overflow-y-auto rounded-md bg-[#0d1117]/50 px-3 py-2">
          <p className="whitespace-pre-wrap text-[11px] italic leading-relaxed text-gray-600">
            {message.content}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Permission request (Allow / Deny buttons)                          */
/* ------------------------------------------------------------------ */

function PermissionRequestBlock({
  message,
  onRespond,
}: {
  message: ChatMessage;
  onRespond?: (id: string, allow: boolean, allowSession?: boolean) => void;
}) {
  const resolved = message.permissionResolved;
  const allowed = message.permissionAllowed;
  const toolName = message.toolName ?? "Tool";
  const { icon: Icon, label } = getToolDisplay(toolName);
  const desc = message.content || getPermissionDescription(toolName, message.permissionInput);

  return (
    <div className="px-4 py-1.5">
      <div className="rounded-lg border border-orange-500/30 bg-[#161b22] px-3.5 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Icon size={14} className="shrink-0 text-orange-400" />
          <span className="text-[12px] font-medium text-orange-300">
            Permission required
          </span>
        </div>

        {/* Tool info */}
        <p className="text-[13px] text-[#e6edf3] mb-1">
          <span className="font-medium">{label}</span>
        </p>
        {desc && (
          <p className="font-mono text-[11px] text-gray-400 mb-3 line-clamp-3 break-all">
            {desc}
          </p>
        )}

        {/* Buttons or resolved state */}
        {resolved ? (
          <div className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium ${
            allowed ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            {allowed ? <FiCheck size={12} /> : <FiX size={12} />}
            {allowed ? "Allowed" : "Denied"}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onRespond?.(message.permissionId!, true)}
                className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-[13px] font-medium text-white active:bg-green-700"
              >
                Allow
              </button>
              <button
                type="button"
                onClick={() => onRespond?.(message.permissionId!, false)}
                className="flex-1 rounded-lg bg-[#21262d] px-3 py-2 text-[13px] font-medium text-gray-300 active:bg-[#30363d]"
              >
                Deny
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRespond?.(message.permissionId!, true, true)}
              className="w-full rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-[12px] font-medium text-green-400 active:bg-green-600/20"
            >
              Allow all {toolName} this session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getPermissionDescription(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return "";
  if (toolName === "Bash" && input.command) return String(input.command).slice(0, 200);
  if (["Read", "Write", "Edit"].includes(toolName) && input.file_path) return String(input.file_path);
  if (toolName === "Grep" && input.pattern) return `pattern: ${input.pattern}`;
  return JSON.stringify(input).slice(0, 200);
}

/* ------------------------------------------------------------------ */
/*  Ask question (tappable option buttons)                             */
/* ------------------------------------------------------------------ */

function AskQuestionBlock({
  message,
  onRespond,
}: {
  message: ChatMessage;
  onRespond?: (id: string, answers: Record<string, string>) => void;
}) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const questions = message.askQuestions ?? [];
  const resolved = message.askResolved;

  const handleSelect = (question: string, label: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [question]: label }));
  };

  const handleSubmit = () => {
    if (Object.keys(selectedAnswers).length === questions.length) {
      onRespond?.(message.askId!, selectedAnswers);
    }
  };

  if (questions.length === 0) return null;

  return (
    <div className="px-4 py-1.5">
      <div className="rounded-lg border border-blue-500/30 bg-[#161b22] px-3.5 py-3">
        {questions.map((q) => (
          <div key={q.question} className="mb-3 last:mb-0">
            <p className="text-[13px] font-medium text-[#e6edf3] mb-2">
              {q.question}
            </p>
            <div className="space-y-1.5">
              {q.options.map((opt) => {
                const isSelected = selectedAnswers[q.question] === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => !resolved && handleSelect(q.question, opt.label)}
                    disabled={!!resolved}
                    className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-[#30363d] bg-[#0d1117] active:bg-[#1c2128]"
                    } ${resolved ? "opacity-60" : ""}`}
                  >
                    <div className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      isSelected ? "border-blue-500 bg-blue-500" : "border-gray-600"
                    }`} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#e6edf3]">{opt.label}</p>
                      {opt.description && (
                        <p className="text-[11px] text-gray-500">{opt.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {!resolved && Object.keys(selectedAnswers).length === questions.length && (
          <button
            type="button"
            onClick={handleSubmit}
            className="mt-2 w-full rounded-lg bg-[#1f6feb] px-3 py-2 text-[13px] font-medium text-white active:opacity-80"
          >
            Submit
          </button>
        )}

        {resolved && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
            <FiCheck size={12} />
            <span>Answered</span>
          </div>
        )}
      </div>
    </div>
  );
}
