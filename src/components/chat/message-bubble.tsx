"use client";

import { useState } from "react";
import Markdown from "react-markdown";
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
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
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

  /* ── Assistant text (with markdown) ── */
  return (
    <div className="flex justify-start px-4 py-1.5">
      <div className="min-w-0 max-w-[90%]">
        {message.content ? (
          <Markdown components={markdownComponents}>{message.content}</Markdown>
        ) : (
          <span className="inline-block h-4 w-0.5 animate-pulse bg-gray-400" />
        )}
      </div>
    </div>
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
