import type { Database } from "@db/sqlite";
import type { ContentBlock } from "@zypher/agent";
import type { Chat, ChatMessage } from "../frontend-lib/types.ts";

// Row types from SQLite (snake_case)
interface ChatRow {
  id: string;
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  checkpoint_id: string | null;
  created_at: string;
}

// ==================== Helpers ====================

function rowToChat(row: ChatRow): Chat {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role as "user" | "assistant",
    content: JSON.parse(row.content),
    checkpointId: row.checkpoint_id,
    createdAt: row.created_at,
  };
}

// ==================== Service ====================

export class ChatService {
  constructor(private db: Database) {}

  // ==================== Chat Operations ====================

  listChats(sessionId: string): Chat[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM chats WHERE session_id = ? ORDER BY updated_at DESC",
      )
      .all<ChatRow>(sessionId);
    return rows.map(rowToChat);
  }

  getChat(chatId: string, sessionId: string): Chat | null {
    const row = this.db
      .prepare("SELECT * FROM chats WHERE id = ? AND session_id = ?")
      .get<ChatRow>(chatId, sessionId);
    return row ? rowToChat(row) : null;
  }

  createChat(sessionId: string, title: string = "New Chat"): Chat {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO chats (id, session_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, sessionId, title, now, now);
    return { id, sessionId, title, createdAt: now, updatedAt: now };
  }

  updateChatTitle(
    chatId: string,
    sessionId: string,
    title: string,
  ): Chat | null {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        "UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND session_id = ?",
      )
      .run(title, now, chatId, sessionId);

    if (result === 0) return null;

    return this.getChat(chatId, sessionId);
  }

  deleteChat(chatId: string, sessionId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM chats WHERE id = ? AND session_id = ?")
      .run(chatId, sessionId);
    return result > 0;
  }

  touchChat(chatId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE chats SET updated_at = ? WHERE id = ?")
      .run(now, chatId);
  }

  // ==================== ChatMessage Operations ====================

  getChatMessages(chatId: string, sessionId: string): ChatMessage[] {
    // Verify session owns the chat first
    const chat = this.getChat(chatId, sessionId);
    if (!chat) {
      return [];
    }

    const rows = this.db
      .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at")
      .all<ChatMessageRow>(chatId);
    return rows.map(rowToChatMessage);
  }

  addChatMessage(
    chatId: string,
    role: "user" | "assistant",
    content: ContentBlock[],
    checkpointId?: string,
  ): ChatMessage {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const contentJson = JSON.stringify(content);

    this.db
      .prepare(
        "INSERT INTO messages (id, chat_id, role, content, checkpoint_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, chatId, role, contentJson, checkpointId ?? null, now);

    // Update chat's updatedAt
    this.touchChat(chatId);

    return {
      id,
      chatId,
      role,
      content,
      checkpointId: checkpointId ?? null,
      createdAt: now,
    };
  }

  deleteChatMessage(
    chatId: string,
    sessionId: string,
    messageId: string,
  ): boolean {
    // Verify chat belongs to session
    const chat = this.getChat(chatId, sessionId);
    if (!chat) return false;

    const result = this.db
      .prepare("DELETE FROM messages WHERE id = ? AND chat_id = ?")
      .run(messageId, chatId);

    return result > 0;
  }
}
