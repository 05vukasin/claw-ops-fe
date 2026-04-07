"use client";

import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.type === "error") {
    return (
      <div className="flex justify-center px-4 py-1.5">
        <span className="rounded-md bg-red-500/10 px-3 py-1.5 text-[12px] text-red-400">
          {message.content}
        </span>
      </div>
    );
  }

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

  // Assistant message
  return (
    <div className="flex justify-start px-4 py-1.5">
      <div className="max-w-[90%]">
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#e6edf3]">
          {message.content}
          {/* Blinking cursor while streaming */}
          {message.content === "" && (
            <span className="inline-block h-4 w-0.5 animate-pulse bg-gray-400" />
          )}
        </p>
      </div>
    </div>
  );
}
