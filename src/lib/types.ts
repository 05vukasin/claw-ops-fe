export type ServerAuthType = "PASSWORD" | "PRIVATE_KEY";
export type ServerStatus = "ONLINE" | "OFFLINE" | "UNKNOWN" | "ERROR";

/* ------------------------------------------------------------------ */
/*  Chat types                                                         */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  type: "text" | "tool_use" | "tool_result" | "thinking" | "error";
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: string;
  isError?: boolean;
  timestamp: number;
}

export type ClaudeStatus =
  | "disconnected"
  | "connecting"
  | "idle"
  | "thinking"
  | "tool_running";

export interface ActiveToolInfo {
  name: string;
  callId: string;
}

export interface ChatSession {
  sessionId: string;
  display: string;
  timestamp: number;
}
