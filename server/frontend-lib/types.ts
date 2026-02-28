/**
 * App-specific types for database entities and sync events.
 */

import type { ContentBlock } from "@zypher/agent";

// =========================== CHAT MESSAGE TYPES ===========================

/**
 * Chat message stored in the database.
 */
export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: ContentBlock[];
  checkpointId: string | null;
  createdAt: string;
}

// =========================== CHAT TYPES ===========================

export interface Chat {
  id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// =========================== SYNC EVENT TYPES ===========================

export type SyncEvent =
  | { type: "chat_created"; chat: Chat }
  | { type: "chat_updated"; chat: Chat }
  | { type: "chat_deleted"; chatId: string }
  | { type: "message_added"; chatId: string; message: ChatMessage }
  | { type: "message_deleted"; chatId: string; messageId: string }
  | { type: "task_started"; chatId: string }
  | { type: "task_ended"; chatId: string }
  | { type: "task_cancel_requested"; chatId: string };
