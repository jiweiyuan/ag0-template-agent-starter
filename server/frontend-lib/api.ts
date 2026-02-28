/**
 * Zypher API Client
 */

import { Observable } from "rxjs";

import type { ContentBlock, Message } from "@zypher/agent";
import type { Chat, ChatMessage, SyncEvent } from "./types.ts";

/**
 * Type guard to validate if a value is a Message object.
 * Also handles converting string timestamps to Date objects.
 */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;

  if (msg.role !== "user" && msg.role !== "assistant") return false;
  if (!Array.isArray(msg.content)) return false;

  // Convert string timestamp to Date if needed
  if (typeof msg.timestamp === "string") {
    (msg as { timestamp: Date }).timestamp = new Date(msg.timestamp);
  }
  if (!(msg.timestamp instanceof Date)) return false;

  return true;
}

// =========================== EVENT TYPES ===========================

export type TaskEvent =
  | TaskTextEvent
  | TaskMessageEvent
  | TaskHistoryChangedEvent
  | TaskToolUseEvent
  | TaskToolUseInputEvent
  | TaskToolUsePendingApprovalEvent
  | TaskToolUseRejectedEvent
  | TaskToolUseApprovedEvent
  | TaskCancelledEvent
  | TaskCompletedEvent
  | TaskErrorEvent
  | TaskHeartbeatEvent;

export interface BaseEvent {
  eventId: string;
}

export interface TaskTextEvent extends BaseEvent {
  type: "text";
  content: string;
}

export interface TaskMessageEvent extends BaseEvent {
  type: "message";
  message: Message;
}

export interface TaskHistoryChangedEvent extends BaseEvent {
  type: "history_changed";
}

export interface TaskToolUseEvent extends BaseEvent {
  type: "tool_use";
  toolName: string;
}

export interface TaskToolUseInputEvent extends BaseEvent {
  type: "tool_use_input";
  toolName: string;
  partialInput: string;
}

export interface TaskToolUsePendingApprovalEvent extends BaseEvent {
  type: "tool_use_pending_approval";
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface TaskToolUseRejectedEvent extends BaseEvent {
  type: "tool_use_rejected";
  toolName: string;
  reason: string;
}

export interface TaskToolUseApprovedEvent extends BaseEvent {
  type: "tool_use_approved";
  toolName: string;
}

export interface TaskCancelledEvent extends BaseEvent {
  type: "cancelled";
  reason: "user" | "timeout";
}

export interface TaskCompletedEvent extends BaseEvent {
  type: "completed";
  timestamp: Date;
}

export interface TaskErrorEvent extends BaseEvent {
  type: "error";
  error: string;
}

export interface TaskHeartbeatEvent extends BaseEvent {
  type: "heartbeat";
  timestamp: number;
}

// =========================== WEBSOCKET MESSAGE TYPES ===========================

type WSClientMessage =
  | {
      action: "startTask";
      task: string;
      model?: string;
      fileAttachments?: string[];
    }
  | {
      action: "resumeTask";
      lastEventId?: string;
    }
  | {
      action: "cancelTask";
    }
  | {
      action: "approveTool";
      approved: boolean;
    };

// =========================== WEBSOCKET CONNECTION ===========================

export class AgentWebSocketConnection {
  private readonly ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  private sendMessage(message: WSClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  cancelTask(): void {
    this.sendMessage({ action: "cancelTask" });
  }

  approveTool(approved: boolean): void {
    this.sendMessage({ action: "approveTool", approved });
  }

  close(): void {
    this.ws.close();
  }
}

// =========================== API CLIENT ===========================

/**
 * Options for creating a ZypherApiClient
 */
export interface ZypherApiClientOptions {
  baseUrl: string;
  sessionId?: string;
}

/**
 * Options for starting a task
 */
export interface StartTaskOptions {
  fileAttachments?: string[];
  model?: string;
  /** Message ID to exclude from agent's initialMessages (used for cancel-to-edit flow) */
  excludeMessageId?: string;
}

/**
 * API client for Zypher agent communication.
 * Supports both REST API calls and WebSocket connections for streaming.
 */
export class ZypherApiClient {
  private readonly options: ZypherApiClientOptions;
  // Unique connection ID for this tab, used to exclude self from broadcasts
  private connectionId: string | null = null;

  constructor(options: ZypherApiClientOptions) {
    this.options = options;
  }

  /**
   * Set the connection ID (received from sync WebSocket)
   */
  setConnectionId(connectionId: string): void {
    this.connectionId = connectionId;
  }

  /**
   * Get the connection ID for this tab
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.options.sessionId) {
      headers["X-Session-ID"] = this.options.sessionId;
    }
    if (this.connectionId) {
      headers["X-Connection-ID"] = this.connectionId;
    }
    return headers;
  }

  /**
   * Create WebSocket connection. If chatId provided, connects to chat-specific agent.
   */
  private createWebSocket(chatId?: string, excludeMessageId?: string): WebSocket {
    const wsUrl = this.options.baseUrl.replace(/^http/, "ws");
    const protocols = ["zypher.v1"];

    if (chatId) {
      if (this.options.sessionId) {
        protocols.push(`ws-session-${this.options.sessionId}`);
      }
      // Pass excludeMessageId via WebSocket protocol (same pattern as sessionId)
      if (excludeMessageId) {
        protocols.push(`ws-exclude-${excludeMessageId}`);
      }
      return new WebSocket(`${wsUrl}/chats/${chatId}/agent/task/ws`, protocols);
    }

    return new WebSocket(`${wsUrl}/task/ws`, protocols);
  }

  private setupWebSocketHandlers(
    ws: WebSocket,
    observer: {
      next: (value: TaskEvent) => void;
      error: (err: Error) => void;
      complete: () => void;
    },
  ): void {
    ws.onmessage = (event) => {
      try {
        const taskEvent: TaskEvent = JSON.parse(event.data);
        observer.next(taskEvent);
      } catch (error) {
        console.error("Failed to parse task event message:", error);
        observer.error(new Error("Failed to parse task event message"));
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket connection error:", error);
      observer.error(new Error("WebSocket connection error"));
    };

    ws.onclose = (event) => {
      console.log(`WebSocket closed: ${event.code} ${event.reason ?? ""}`);
      if (event.code === 1000) {
        observer.complete();
      } else {
        observer.error(
          new Error(
            `Connection closed: ${event.code} ${
              event.reason ?? "Unknown reason"
            }`,
          ),
        );
      }
    };
  }

  /**
   * Start a task and return a connection with Observable of events
   */
  async startTask(
    taskPrompt: string,
    options?: StartTaskOptions,
  ): Promise<{
    connection: AgentWebSocketConnection;
    events$: Observable<TaskEvent>;
  }> {
    const ws = this.createWebSocket();
    const connection = new AgentWebSocketConnection(ws);

    const events$ = new Observable<TaskEvent>((observer) => {
      this.setupWebSocketHandlers(ws, observer);

      // Teardown: close WebSocket when unsubscribed
      return () => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };
    });

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log("WebSocket connected, starting task");
        const message: WSClientMessage = {
          action: "startTask",
          task: taskPrompt,
          fileAttachments: options?.fileAttachments,
          model: options?.model,
        };
        ws.send(JSON.stringify(message));
        resolve({ connection, events$ });
      };

      ws.onerror = () => {
        reject(new Error("Failed to connect"));
      };
    });
  }

  /**
   * Start a task for a specific chat.
   * The chat's agent is created with the chat's message history as context.
   */
  async startTaskForChat(
    chatId: string,
    taskPrompt: string,
    options?: StartTaskOptions,
  ): Promise<{
    connection: AgentWebSocketConnection;
    events$: Observable<TaskEvent>;
  }> {
    const ws = this.createWebSocket(chatId, options?.excludeMessageId);
    const connection = new AgentWebSocketConnection(ws);

    const events$ = new Observable<TaskEvent>((observer) => {
      this.setupWebSocketHandlers(ws, observer);

      return () => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };
    });

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log(`WebSocket connected to chat ${chatId}, starting task`);
        const message: WSClientMessage = {
          action: "startTask",
          task: taskPrompt,
          fileAttachments: options?.fileAttachments,
          model: options?.model,
        };
        ws.send(JSON.stringify(message));
        resolve({ connection, events$ });
      };

      ws.onerror = () => {
        reject(new Error("Failed to connect"));
      };
    });
  }

  /**
   * Destroy the agent for a specific chat.
   * Call this when switching away from a chat to free resources.
   */
  async destroyChatAgent(chatId: string): Promise<void> {
    const headers = this.getHeaders();
    const response = await fetch(
      `${this.options.baseUrl}/chats/${chatId}/agent`,
      {
        method: "DELETE",
        headers: headers,
      },
    );
    if (!response.ok) {
      console.warn(
        `Failed to destroy agent for chat ${chatId}: ${response.status}`,
      );
    }
  }

  /**
   * Mark a chat's agent for pending destruction.
   * Called when switching away from a chat that has a running task.
   * The agent will be destroyed after the task completes.
   */
  async markPendingDestruction(chatId: string): Promise<void> {
    const headers = this.getHeaders();
    const response = await fetch(
      `${this.options.baseUrl}/chats/${chatId}/agent/pending-destruction`,
      {
        method: "POST",
        headers: headers,
      },
    );
    if (!response.ok) {
      console.warn(
        `Failed to mark pending destruction for chat ${chatId}: ${response.status}`,
      );
    }
  }

  /**
   * Cancel pending destruction for a chat's agent.
   * Called when switching back to a chat that was marked for pending destruction.
   */
  async cancelPendingDestruction(chatId: string): Promise<void> {
    const headers = this.getHeaders();
    const response = await fetch(
      `${this.options.baseUrl}/chats/${chatId}/agent/pending-destruction`,
      {
        method: "DELETE",
        headers: headers,
      },
    );
    if (!response.ok) {
      console.warn(
        `Failed to cancel pending destruction for chat ${chatId}: ${response.status}`,
      );
    }
  }

  /**
   * Get list of active chat agents on the server.
   * Used to check for running tasks on page load.
   */
  async getActiveAgents(): Promise<{
    agents: Array<{
      chatId: string;
      messageCount: number;
      isTaskRunning?: boolean;
      pendingDestruction?: boolean;
      /** ConnectionId of the tab handling this task */
      handlerConnectionId?: string;
      /** Whether the handler connection is still active */
      isHandlerConnected?: boolean;
    }>;
  }> {
    const headers = this.getHeaders();
    const response = await fetch(`${this.options.baseUrl}/agents/active`, {
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to get active agents: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Resume a running task for a specific chat
   */
  async resumeTaskForChat(
    chatId: string,
    lastEventId?: string,
  ): Promise<{
    connection: AgentWebSocketConnection;
    events$: Observable<TaskEvent>;
  }> {
    const ws = this.createWebSocket(chatId);
    const connection = new AgentWebSocketConnection(ws);

    const events$ = new Observable<TaskEvent>((observer) => {
      this.setupWebSocketHandlers(ws, observer);

      return () => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };
    });

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log(`WebSocket connected to chat ${chatId}, resuming task`);
        const message: WSClientMessage = {
          action: "resumeTask",
          lastEventId,
        };
        ws.send(JSON.stringify(message));
        resolve({ connection, events$ });
      };

      ws.onerror = () => {
        reject(new Error("Failed to connect"));
      };
    });
  }

  /**
   * Resume a running task
   */
  async resumeTask(lastEventId?: string): Promise<{
    connection: AgentWebSocketConnection;
    events$: Observable<TaskEvent>;
  }> {
    const ws = this.createWebSocket();
    const connection = new AgentWebSocketConnection(ws);

    const events$ = new Observable<TaskEvent>((observer) => {
      this.setupWebSocketHandlers(ws, observer);

      // Teardown: close WebSocket when unsubscribed
      return () => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };
    });

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log("WebSocket connected, resuming task");
        const message: WSClientMessage = {
          action: "resumeTask",
          lastEventId,
        };
        ws.send(JSON.stringify(message));
        resolve({ connection, events$ });
      };

      ws.onerror = () => {
        reject(new Error("Failed to connect"));
      };
    });
  }

  // ==================== Chat API Methods ====================

  /**
   * List all chats for the authenticated user
   */
  async listChats(): Promise<Chat[]> {
    const headers = this.getHeaders();
    const response = await fetch(`${this.options.baseUrl}/chats`, {
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to list chats: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  }

  /**
   * Create a new chat
   */
  async createChat(title?: string): Promise<Chat> {
    const headers = this.getHeaders();
    const response = await fetch(`${this.options.baseUrl}/chats`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create chat: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  }

  /**
   * Get a specific chat
   */
  async getChat(chatId: string): Promise<Chat> {
    const headers = this.getHeaders();
    const response = await fetch(`${this.options.baseUrl}/chats/${chatId}`, {
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to get chat: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  }

  /**
   * Update a chat (rename)
   */
  async updateChat(chatId: string, title: string): Promise<Chat> {
    const headers = this.getHeaders();
    const response = await fetch(`${this.options.baseUrl}/chats/${chatId}`, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update chat: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  }

  /**
   * Delete a chat
   */
  async deleteChat(chatId: string): Promise<void> {
    const headers = this.getHeaders();
    const response = await fetch(`${this.options.baseUrl}/chats/${chatId}`, {
      method: "DELETE",
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to delete chat: ${response.status}`);
    }
  }

  /**
   * Get messages for a specific chat
   */
  async getChatMessages(chatId: string): Promise<ChatMessage[]> {
    const headers = this.getHeaders();
    const response = await fetch(
      `${this.options.baseUrl}/chats/${chatId}/messages`,
      { headers: headers },
    );
    if (!response.ok) {
      throw new Error(`Failed to get chat messages: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  }

  /**
   * Add a message to a chat
   */
  async addChatMessage(
    chatId: string,
    role: "user" | "assistant",
    content: ContentBlock[],
    checkpointId?: string | null,
  ): Promise<ChatMessage> {
    const headers = this.getHeaders();
    const response = await fetch(
      `${this.options.baseUrl}/chats/${chatId}/messages`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role, content, checkpointId }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to add message: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  }

  /**
   * Delete a message from a chat
   */
  async deleteChatMessage(chatId: string, messageId: string): Promise<void> {
    const headers = this.getHeaders();
    const response = await fetch(
      `${this.options.baseUrl}/chats/${chatId}/messages/${messageId}`,
      {
        method: "DELETE",
        headers: headers,
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to delete message: ${response.status}`);
    }
  }

  /**
   * Generate a title for a chat based on the user's message.
   * Fire-and-forget: returns immediately, title update comes via sync WebSocket.
   */
  async generateTitle(chatId: string, message: string): Promise<void> {
    const headers = this.getHeaders();
    await fetch(`${this.options.baseUrl}/chats/${chatId}/generate-title`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    // Fire and forget - don't check response
  }

  /**
   * Notify that a task has started on a chat (broadcasts to other tabs).
   */
  async notifyTaskStarted(chatId: string): Promise<void> {
    const headers = this.getHeaders();
    await fetch(`${this.options.baseUrl}/chats/${chatId}/task-started`, {
      method: "POST",
      headers,
    });
  }

  /**
   * Notify that a task has ended on a chat (broadcasts to other tabs).
   */
  async notifyTaskEnded(chatId: string): Promise<void> {
    const headers = this.getHeaders();
    await fetch(`${this.options.baseUrl}/chats/${chatId}/task-ended`, {
      method: "POST",
      headers,
    });
  }

  /**
   * Cancel a task running on a chat (from another tab).
   */
  async cancelChatTask(chatId: string): Promise<void> {
    const headers = this.getHeaders();
    await fetch(`${this.options.baseUrl}/chats/${chatId}/cancel`, {
      method: "POST",
      headers,
    });
  }

  /**
   * Connect to the sync WebSocket for real-time chat list updates.
   * Returns a close function to disconnect.
   */
  connectSyncWebSocket(
    onEvent: (event: SyncEvent) => void,
    options: { delay?: number } = {},
  ): { close: () => void } {
    const { delay = 0 } = options;
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let connectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isClosed = false;

    const connect = () => {
      const wsBaseUrl = this.options.baseUrl.replace(/^http/, "ws");

      // Use Sec-WebSocket-Protocol for session ID (same pattern as task WebSocket)
      const protocols = this.options.sessionId
        ? [`ws-session-${this.options.sessionId}`]
        : [];

      ws = new WebSocket(`${wsBaseUrl}/sync/ws`, protocols);

      ws.onopen = () => {
        console.log("[sync] WebSocket connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Handle connection ID assignment
          if (data.type === "connected" && data.connectionId) {
            this.setConnectionId(data.connectionId);
            console.log("[sync] Connection ID:", data.connectionId);
            return;
          }
          // Handle sync events
          onEvent(data as SyncEvent);
        } catch (error) {
          console.error("[sync] Failed to parse event:", error);
        }
      };

      ws.onclose = () => {
        console.log("[sync] WebSocket disconnected");
        if (!isClosed) {
          // Auto-reconnect after 3 seconds
          reconnectTimeout = setTimeout(() => {
            if (!isClosed) {
              console.log("[sync] Reconnecting...");
              connect();
            }
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("[sync] WebSocket error:", error);
      };
    };

    // Delay initial connection to avoid race condition on startup
    if (delay > 0) {
      connectTimeout = setTimeout(connect, delay);
    } else {
      connect();
    }

    const closeFn = () => {
      isClosed = true;
      if (connectTimeout) {
        clearTimeout(connectTimeout);
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        ws.close();
      }
    };

    return { close: () => closeFn() };
  }
}
