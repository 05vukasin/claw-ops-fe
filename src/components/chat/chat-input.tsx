"use client";

import { useCallback, useRef, useState } from "react";
import { FiSend } from "react-icons/fi";
import type { ClaudeStatus } from "@/lib/types";

interface ChatInputProps {
  status: ClaudeStatus;
  onSend: (text: string) => void;
}

export function ChatInput({ status, onSend }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && status === "idle";

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(text);
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max 4 lines (~96px at 16px font + line height)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  return (
    <div
      className="shrink-0 border-t border-[#21262d] bg-[#0d1117] px-3 py-2.5"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)" }}
    >
      {status === "thinking" && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
          <span className="text-[11px] text-gray-500">Claude is thinking...</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            status === "idle"
              ? "Message Claude..."
              : status === "connecting"
                ? "Connecting..."
                : status === "thinking"
                  ? "Waiting for response..."
                  : "Disconnected"
          }
          disabled={status === "disconnected" || status === "connecting"}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-[#30363d] bg-[#161b22] px-3.5 py-2.5 text-[16px] leading-normal text-[#e6edf3] placeholder:text-gray-600 focus:border-[#444c56] focus:outline-none disabled:opacity-50"
          style={{ fontSize: "16px" }} // Prevents iOS zoom
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1f6feb] text-white transition-opacity disabled:opacity-30"
        >
          <FiSend size={18} />
        </button>
      </div>
    </div>
  );
}
