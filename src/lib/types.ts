export type ServerAuthType = "PASSWORD" | "PRIVATE_KEY";
export type ServerStatus = "ONLINE" | "OFFLINE" | "UNKNOWN" | "ERROR";

/* ------------------------------------------------------------------ */
/*  Chat types                                                         */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  type: "text" | "tool_use" | "error";
  content: string;
  toolName?: string;
  timestamp: number;
}

export type ClaudeStatus =
  | "disconnected"
  | "connecting"
  | "idle"
  | "thinking";

export interface ChatSession {
  sessionId: string;
  display: string;
  timestamp: number;
}
