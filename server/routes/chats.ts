import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createMiddleware } from "hono/factory";
import { ChatService } from "../services/chat_service.ts";
import { broadcastSyncEvent } from "../services/sync_service.ts";
import { generateChatTitle } from "../services/title_service.ts";
import { chatsLogger as logger } from "../lib/logger.ts";

interface SessionEnv {
  Variables: {
    sessionId: string;
    connectionId: string | undefined;
  };
}

// Middleware: extracts session ID and connection ID from headers
const sessionMiddleware = createMiddleware<SessionEnv>(async (c, next) => {
  const sessionId = c.req.header("X-Session-ID");
  if (!sessionId) {
    return c.json({ error: "missing_session_id" }, 400);
  }
  c.set("sessionId", sessionId);
  // Connection ID is optional - used to exclude sender from broadcasts
  c.set("connectionId", c.req.header("X-Connection-ID"));
  await next();
});

const createChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

const updateChatSchema = z.object({
  title: z.string().min(1).max(200),
});

const addMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.array(z.any()), // ContentBlock[] - relaxed validation for now
  checkpointId: z.string().nullish(), // accepts string | null | undefined
});

const generateTitleSchema = z.object({
  message: z.string().min(1),
});

export interface ChatRoutesOptions {
  chatService: ChatService;
  /** Called to destroy a chat's agent (on deletion or when switching away) */
  onDestroyAgent?: (chatId: string) => void;
  /** Called when a chat's agent should be marked for pending destruction */
  onMarkPendingDestruction?: (chatId: string) => void;
  /** Called when pending destruction for a chat should be cancelled */
  onCancelPendingDestruction?: (chatId: string) => void;
  /** Called when a task starts - registers the handler connectionId */
  onTaskStarted?: (chatId: string, connectionId: string) => void;
  /** Called when a task ends - clears the handler */
  onTaskEnded?: (chatId: string) => void;
}

export function createChatRoutes(options: ChatRoutesOptions) {
  const {
    chatService,
    onDestroyAgent,
    onMarkPendingDestruction,
    onCancelPendingDestruction,
    onTaskStarted,
    onTaskEnded,
  } = options;
  const app = new Hono<SessionEnv>();

  // Apply session middleware to all routes
  app.use("*", sessionMiddleware);

  // List all chats for the user
  app.get("/", async (c) => {
    const sessionId = c.get("sessionId");
    const chats = await chatService.listChats(sessionId);
    return c.json({ data: chats });
  });

  // Create a new chat
  app.post("/", zValidator("json", createChatSchema), async (c) => {
    const sessionId = c.get("sessionId");
    const connectionId = c.get("connectionId");
    const body = c.req.valid("json");
    const chat = await chatService.createChat(sessionId, body.title);
    // Broadcast sync event (exclude sender)
    broadcastSyncEvent(sessionId, { type: "chat_created", chat }, connectionId);
    return c.json({ data: chat }, 201);
  });

  // Get a specific chat
  app.get("/:id", async (c) => {
    const sessionId = c.get("sessionId");
    const chatId = c.req.param("id");
    const chat = await chatService.getChat(chatId, sessionId);

    if (!chat) {
      return c.json({ error: "chat_not_found" }, 404);
    }

    return c.json({ data: chat });
  });

  // Update a chat (rename)
  app.patch("/:id", zValidator("json", updateChatSchema), async (c) => {
    const sessionId = c.get("sessionId");
    const connectionId = c.get("connectionId");
    const chatId = c.req.param("id");
    const body = c.req.valid("json");

    const chat = await chatService.updateChatTitle(
      chatId,
      sessionId,
      body.title,
    );

    if (!chat) {
      return c.json({ error: "chat_not_found" }, 404);
    }

    // Broadcast sync event (exclude sender)
    broadcastSyncEvent(sessionId, { type: "chat_updated", chat }, connectionId);
    return c.json({ data: chat });
  });

  // Delete a chat
  app.delete("/:id", (c) => {
    const sessionId = c.get("sessionId");
    const connectionId = c.get("connectionId");
    const chatId = c.req.param("id");

    const deleted = chatService.deleteChat(chatId, sessionId);

    if (!deleted) {
      return c.json({ error: "chat_not_found" }, 404);
    }

    // Clean up associated agent if callback provided
    onDestroyAgent?.(chatId);

    // Broadcast sync event (exclude sender)
    broadcastSyncEvent(
      sessionId,
      { type: "chat_deleted", chatId },
      connectionId,
    );

    return c.json({ success: true });
  });

  // Get messages for a chat
  app.get("/:id/messages", async (c) => {
    const sessionId = c.get("sessionId");
    const chatId = c.req.param("id");

    const messages = await chatService.getChatMessages(chatId, sessionId);
    return c.json({ data: messages });
  });

  // Add a message to a chat
  app.post(
    "/:id/messages",
    zValidator("json", addMessageSchema),
    async (c) => {
      const sessionId = c.get("sessionId");
      const connectionId = c.get("connectionId");
      const chatId = c.req.param("id");
      const body = c.req.valid("json");

      // Verify user owns the chat
      const chat = await chatService.getChat(chatId, sessionId);
      if (!chat) {
        return c.json({ error: "chat_not_found" }, 404);
      }

      const message = await chatService.addChatMessage(
        chatId,
        body.role,
        body.content,
        body.checkpointId ?? undefined,
      );

      // Broadcast message to other tabs (exclude sender)
      broadcastSyncEvent(
        sessionId,
        { type: "message_added", chatId, message },
        connectionId,
      );

      return c.json({ data: message }, 201);
    },
  );

  // Delete a message from a chat
  app.delete("/:id/messages/:messageId", (c) => {
    const sessionId = c.get("sessionId");
    const connectionId = c.get("connectionId");
    const chatId = c.req.param("id");
    const messageId = c.req.param("messageId");

    const deleted = chatService.deleteChatMessage(chatId, sessionId, messageId);

    if (!deleted) {
      return c.json({ error: "message_not_found" }, 404);
    }

    // Broadcast to other tabs so they can remove the message from UI
    broadcastSyncEvent(
      sessionId,
      { type: "message_deleted", chatId, messageId },
      connectionId,
    );

    return c.json({ success: true });
  });

  // Generate title for a chat based on user message
  app.post(
    "/:id/generate-title",
    zValidator("json", generateTitleSchema),
    async (c) => {
      const sessionId = c.get("sessionId");
      const chatId = c.req.param("id");
      const { message } = c.req.valid("json");

      const chat = await chatService.getChat(chatId, sessionId);
      if (!chat) {
        return c.json({ error: "chat_not_found" }, 404);
      }

      // Fire and forget - don't block the response
      (async () => {
        try {
          const title = await generateChatTitle(message);
          const updatedChat = await chatService.updateChatTitle(
            chatId,
            sessionId,
            title,
          );
          if (updatedChat) {
            broadcastSyncEvent(sessionId, {
              type: "chat_updated",
              chat: updatedChat,
            });
          }
        } catch (err) {
          logger.error("Title generation failed", err as Error);
        }
      })();

      return c.json({ success: true }, 202);
    },
  );

  // Destroy a chat's agent (called when switching away from a chat)
  app.delete("/:id/agent", (c) => {
    const chatId = c.req.param("id");
    onDestroyAgent?.(chatId);
    return c.json({ success: true });
  });

  // Mark a chat's agent for pending destruction (task still running, user switched away)
  app.post("/:id/agent/pending-destruction", (c) => {
    const chatId = c.req.param("id");
    onMarkPendingDestruction?.(chatId);
    return c.json({ success: true });
  });

  // Cancel pending destruction for a chat (user switched back before task completed)
  app.delete("/:id/agent/pending-destruction", (c) => {
    const chatId = c.req.param("id");
    onCancelPendingDestruction?.(chatId);
    return c.json({ success: true });
  });

  // Notify that a task has started on a chat (broadcast to other tabs)
  app.post("/:id/task-started", (c) => {
    const sessionId = c.get("sessionId");
    const connectionId = c.get("connectionId");
    const chatId = c.req.param("id");
    // Register this connection as the task handler
    if (connectionId) {
      onTaskStarted?.(chatId, connectionId);
    }
    broadcastSyncEvent(
      sessionId,
      { type: "task_started", chatId },
      connectionId,
    );
    return c.json({ success: true });
  });

  // Notify that a task has ended on a chat (broadcast to other tabs)
  app.post("/:id/task-ended", (c) => {
    const sessionId = c.get("sessionId");
    const connectionId = c.get("connectionId");
    const chatId = c.req.param("id");
    // Clear the task handler
    onTaskEnded?.(chatId);
    broadcastSyncEvent(sessionId, { type: "task_ended", chatId }, connectionId);
    return c.json({ success: true });
  });

  return app;
}
