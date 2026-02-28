/**
 * Agent Manager Service
 *
 * Manages the lifecycle of chat-specific agents:
 * - Creation and caching of agents per chat
 * - Pending destruction for agents with running tasks
 * - Task handler tracking for multi-tab coordination
 */

import { Hono } from "hono";
import { createZypherHandler } from "@zypher/http";
import type { Message, ZypherAgent } from "@zypher/agent";
import type { ChatService } from "./chat_service.ts";

/** WebSocket error handler type */
export type WebSocketErrorHandler = (
  error: unknown,
) => { code: number; message: string };

/** Agent entry with associated HTTP handler */
export interface AgentEntry {
  agent: ZypherAgent;
  handler: Hono;
}

/**
 * Manages chat-specific agents and their lifecycle.
 */
export class AgentManager {
  /** Map of chatId -> { agent, handler } */
  private readonly chatAgents = new Map<string, AgentEntry>();

  /** Set of chatIds marked for destruction after their task completes */
  private readonly pendingDestruction = new Set<string>();

  /** Map of chatId -> connectionId that is handling the task */
  private readonly taskHandlers = new Map<string, string>();

  constructor(
    private readonly chatService: ChatService,
    private readonly createAgentFn: (
      initialMessages?: Message[],
    ) => Promise<ZypherAgent>,
    private readonly registerMcpServers: (agent: ZypherAgent) => void,
    private readonly wsErrorHandler?: WebSocketErrorHandler,
  ) {}

  /**
   * Get or create an agent and handler for a specific chat.
   * Creates a new agent with the chat's messages as initialMessages.
   * @param chatId - The chat ID
   * @param sessionId - The session ID for authorization
   * @param excludeMessageId - Optional message ID to exclude from initialMessages
   *   (used when the message is being sent as the current task)
   */
  async getOrCreateAgent(
    chatId: string,
    sessionId: string,
    excludeMessageId?: string,
  ): Promise<AgentEntry> {
    // Return existing entry if available
    const existing = this.chatAgents.get(chatId);
    if (existing) {
      return existing;
    }

    // Fetch messages from database
    const chatMessages = await this.chatService.getChatMessages(
      chatId,
      sessionId,
    );

    // Convert to Message format, filtering out excludeMessageId if provided
    const initialMessages: Message[] = chatMessages
      .filter((msg) => msg.id !== excludeMessageId)
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.createdAt),
        checkpointId: msg.checkpointId ?? undefined,
      }));

    // Create new agent with initial messages
    const agent = await this.createAgentFn(initialMessages);
    this.registerMcpServers(agent);

    // Create and cache the handler
    const zypherHandler = createZypherHandler({
      agent,
      websocket: this.wsErrorHandler
        ? { onError: this.wsErrorHandler }
        : undefined,
    });
    const basePath = `/user-agent/chats/${chatId}/agent`;
    const handler = new Hono().basePath(basePath);
    handler.route("/", zypherHandler);

    const entry = { agent, handler };
    this.chatAgents.set(chatId, entry);
    return entry;
  }

  /**
   * Destroy an agent for a specific chat.
   * Called when chat is deleted or user switches away from a chat without a running task.
   */
  destroyAgent(chatId: string): void {
    this.chatAgents.delete(chatId);
    this.pendingDestruction.delete(chatId);
    this.taskHandlers.delete(chatId);
  }

  /**
   * Mark a chat agent for destruction after its task completes.
   * Used when user switches away from a chat that has a running task.
   */
  markForPendingDestruction(chatId: string): void {
    if (this.chatAgents.has(chatId)) {
      this.pendingDestruction.add(chatId);
    }
  }

  /**
   * Cancel pending destruction for a chat (user switched back).
   */
  cancelPendingDestruction(chatId: string): void {
    this.pendingDestruction.delete(chatId);
  }

  /**
   * Check and destroy agents that are pending destruction and have no running task.
   * Should be called periodically or on certain events.
   */
  cleanupPendingAgents(): void {
    for (const chatId of this.pendingDestruction) {
      const entry = this.chatAgents.get(chatId);
      if (!entry) {
        // Agent already gone, remove from pending
        this.pendingDestruction.delete(chatId);
        continue;
      }

      // Check if agent has a running task
      const isRunning = typeof entry.agent.isTaskRunning === "boolean"
        ? entry.agent.isTaskRunning
        : false;

      if (!isRunning) {
        this.pendingDestruction.delete(chatId);
        this.destroyAgent(chatId);
      }
    }
  }

  /**
   * Register a task handler for a chat.
   * Called when a task starts to track which connection owns the task.
   */
  registerTaskHandler(chatId: string, connectionId: string): void {
    this.taskHandlers.set(chatId, connectionId);
  }

  /**
   * Unregister the task handler for a chat.
   * Called when a task ends.
   */
  unregisterTaskHandler(chatId: string): void {
    this.taskHandlers.delete(chatId);
  }

  /**
   * Get an existing agent entry for a chat (if any).
   */
  getAgent(chatId: string): AgentEntry | undefined {
    return this.chatAgents.get(chatId);
  }

  /**
   * Get all active agents with their status.
   */
  getActiveAgents(): Array<{
    chatId: string;
    messageCount: number;
    isTaskRunning: boolean | undefined;
    pendingDestruction: boolean;
    handlerConnectionId: string | undefined;
  }> {
    return Array.from(this.chatAgents.entries()).map(([chatId, { agent }]) => ({
      chatId,
      messageCount: agent.messages.length,
      isTaskRunning: typeof agent.isTaskRunning === "boolean"
        ? agent.isTaskRunning
        : undefined,
      pendingDestruction: this.pendingDestruction.has(chatId),
      handlerConnectionId: this.taskHandlers.get(chatId),
    }));
  }
}
