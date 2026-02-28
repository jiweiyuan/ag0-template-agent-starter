import { create } from "zustand";
import type { ContentBlock } from "@zypher/agent";
import type { Chat, ChatMessage, SyncEvent } from "./types.ts";
import type { ZypherApiClient } from "./api.ts";
import { generateMessageId } from "./utils.ts";

// ==================== Types ====================

export interface StreamingTextMessage {
  type: "streaming_text";
  id: string;
  text: string;
  timestamp: Date;
}

export interface StreamingToolUseMessage {
  type: "streaming_tool_use";
  id: string;
  toolUseName: string;
  partialInput: string;
  timestamp: Date;
}

export type StreamingMessage = StreamingTextMessage | StreamingToolUseMessage;

export interface CompleteMessage {
  type: "complete";
  id: string;
  role: "user" | "assistant";
  content: ContentBlock[];
  timestamp: Date;
  checkpointId: string | null;
}

// ==================== State ====================

interface ChatState {
  // API client (set on init)
  apiClient: ZypherApiClient | null;

  // Chat list
  chats: Chat[];
  chatsLoading: boolean;

  // Active chat
  activeChatId: string | null;
  messages: CompleteMessage[];
  messagesLoading: boolean;

  // Streaming state (per-chat)
  streamingMessages: Map<string, StreamingMessage[]>;
  // Chats with running tasks in THIS tab (supports concurrent tasks)
  runningTaskChatIds: Set<string>;
  error: string | null;

  // Busy chats (tasks running from other tabs)
  busyChats: Set<string>;

  // Actions
  init: (apiClient: ZypherApiClient) => void;
  fetchChats: () => Promise<void>;
  createChat: (title?: string) => Promise<Chat>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  setActiveChat: (chatId: string | null) => Promise<void>;

  // Message actions
  addOptimisticMessage: (content: ContentBlock[]) => void;
  addMessage: (message: CompleteMessage) => void;
  addCompleteMessage: (chatId: string, message: CompleteMessage) => void;
  removeMessage: (messageId: string) => void;
  persistMessage: (
    chatId: string,
    role: "user" | "assistant",
    content: ContentBlock[],
    checkpointId?: string | null,
  ) => Promise<void>;
  appendStreamingText: (chatId: string, text: string) => void;
  appendStreamingToolUse: (chatId: string, toolName: string, partialInput: string) => void;
  clearStreamingMessages: (chatId: string) => void;

  // Task state
  addRunningTaskChat: (chatId: string) => void;
  removeRunningTaskChat: (chatId: string) => void;
  setError: (error: string | null) => void;

  // Computed helpers
  isTaskRunning: () => boolean;
  isChatRunning: (chatId: string | null) => boolean;
  getStreamingMessages: (chatId: string | null) => StreamingMessage[];

  // Sync
  handleSyncEvent: (event: SyncEvent) => void;
}

// ==================== Helpers ====================

// Use sessionStorage (per-tab, survives refresh) not localStorage (shared across tabs)
const ACTIVE_CHAT_KEY = "active_chat_id";

function saveActiveChatId(chatId: string | null): void {
  if (chatId) {
    sessionStorage.setItem(ACTIVE_CHAT_KEY, chatId);
  } else {
    sessionStorage.removeItem(ACTIVE_CHAT_KEY);
  }
}

function getSavedActiveChatId(): string | null {
  return sessionStorage.getItem(ACTIVE_CHAT_KEY);
}

function transformMessage(msg: ChatMessage): CompleteMessage {
  return {
    type: "complete",
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    checkpointId: msg.checkpointId,
  };
}

// ==================== Store ====================

export const useChatStore = create<ChatState>((set, get) => ({
  // -------------------- Initial State --------------------
  apiClient: null,
  chats: [],
  chatsLoading: false,
  activeChatId: null,
  messages: [],
  messagesLoading: false,
  streamingMessages: new Map<string, StreamingMessage[]>(),
  runningTaskChatIds: new Set<string>(),
  error: null,
  busyChats: new Set<string>(),

  // -------------------- Initialization --------------------

  init: (apiClient) => {
    set({ apiClient });
  },

  // -------------------- Chat List Actions --------------------

  fetchChats: async () => {
    const { apiClient, setActiveChat } = get();
    if (!apiClient) return;

    set({ chatsLoading: true });
    try {
      const chats = await apiClient.listChats();
      set({ chats, chatsLoading: false });

      // Restore saved active chat if it still exists
      const savedChatId = getSavedActiveChatId();
      if (savedChatId && chats.some((c) => c.id === savedChatId)) {
        // Use setTimeout to avoid calling setActiveChat during render
        setTimeout(() => setActiveChat(savedChatId), 0);
      } else if (savedChatId) {
        // Chat was deleted - clear the saved ID
        saveActiveChatId(null);
      }
    } catch (error) {
      console.error("Failed to fetch chats:", error);
      set({ chatsLoading: false });
    }
  },

  createChat: async (title?: string) => {
    const { apiClient } = get();
    if (!apiClient) throw new Error("API client not initialized");

    const chat = await apiClient.createChat(title);
    set((state) => {
      // Don't add if already exists (sync event may have arrived first)
      if (state.chats.some((c) => c.id === chat.id)) {
        return state;
      }
      return { chats: [chat, ...state.chats] };
    });
    return chat;
  },

  renameChat: async (chatId: string, title: string) => {
    const { apiClient } = get();
    if (!apiClient) return;

    // Optimistic update with new timestamp and re-sort
    const now = new Date().toISOString();
    set((state) => {
      const updatedChats = state.chats.map((c) =>
        c.id === chatId ? { ...c, title, updatedAt: now } : c,
      );
      updatedChats.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      return { chats: updatedChats };
    });

    try {
      await apiClient.updateChat(chatId, title);
    } catch (error) {
      // Revert on failure
      console.error("Failed to rename chat:", error);
      get().fetchChats();
    }
  },

  deleteChat: async (chatId: string) => {
    const { apiClient, activeChatId } = get();
    if (!apiClient) return;

    // Clear saved active chat ID if deleting the active chat
    if (activeChatId === chatId) {
      saveActiveChatId(null);
    }

    // Optimistic update
    set((state) => {
      const newStreamingMessages = new Map(state.streamingMessages);
      newStreamingMessages.delete(chatId);
      return {
        chats: state.chats.filter((c) => c.id !== chatId),
        activeChatId: activeChatId === chatId ? null : activeChatId,
        messages: activeChatId === chatId ? [] : state.messages,
        streamingMessages: newStreamingMessages,
      };
    });

    try {
      await apiClient.deleteChat(chatId);
    } catch (error) {
      // Revert on failure
      console.error("Failed to delete chat:", error);
      get().fetchChats();
    }
  },

  // -------------------- Active Chat & Messages --------------------

  setActiveChat: async (chatId: string | null) => {
    const { apiClient, activeChatId, runningTaskChatIds } = get();

    if (chatId === activeChatId) return;

    // Persist active chat ID to localStorage
    saveActiveChatId(chatId);

    // Don't clear streaming messages - they're per-chat now
    set({
      activeChatId: chatId,
      messages: [],
      messagesLoading: chatId !== null,
      error: null,
    });

    // Handle the previous chat's agent
    if (activeChatId && apiClient) {
      if (runningTaskChatIds.has(activeChatId)) {
        // Task is still running - mark for pending destruction
        // Agent will be destroyed after task completes
        apiClient.markPendingDestruction(activeChatId).catch(() => {});
      } else {
        // No task running - destroy immediately
        apiClient.destroyChatAgent(activeChatId).catch(() => {});
      }
    }

    if (chatId && apiClient) {
      // Cancel any pending destruction for this chat (user switched back)
      apiClient.cancelPendingDestruction(chatId).catch(() => {});

      try {
        // Fetch chat messages from database for UI display
        const chatMessages = await apiClient.getChatMessages(chatId);

        // Update UI state
        // Note: The agent for this chat will be created lazily when the user sends a message
        set({
          messages: chatMessages.map(transformMessage),
          messagesLoading: false,
        });
      } catch (error) {
        console.error("Failed to fetch messages:", error);
        set({ messagesLoading: false });
      }
    }
  },

  addOptimisticMessage: (content: ContentBlock[]) => {
    const optimisticMsg: CompleteMessage = {
      type: "complete",
      id: generateMessageId("optimistic"),
      role: "user",
      content,
      timestamp: new Date(),
      checkpointId: null,
    };
    set((state) => ({ messages: [...state.messages, optimisticMsg] }));
  },

  addMessage: (message: CompleteMessage) => {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  addCompleteMessage: (chatId: string, message: CompleteMessage) => {
    set((state) => {
      // Clear streaming messages for this chat
      const newStreamingMessages = new Map(state.streamingMessages);
      newStreamingMessages.delete(chatId);

      // Only add to messages if viewing this chat
      if (state.activeChatId !== chatId) {
        return { streamingMessages: newStreamingMessages };
      }

      return {
        messages: [...state.messages, message],
        streamingMessages: newStreamingMessages,
      };
    });
  },

  removeMessage: (messageId: string) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
  },

  persistMessage: async (
    chatId: string,
    role: "user" | "assistant",
    content: ContentBlock[],
    checkpointId?: string | null,
  ) => {
    const { apiClient } = get();
    if (!apiClient) {
      console.warn("Cannot persist message: no API client");
      return;
    }

    try {
      await apiClient.addChatMessage(chatId, role, content, checkpointId);
      // Update chat's updatedAt and move to top of list
      const now = new Date().toISOString();
      set((state) => {
        const updatedChats = state.chats.map((c) =>
          c.id === chatId ? { ...c, updatedAt: now } : c,
        );
        updatedChats.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        return { chats: updatedChats };
      });
    } catch (error) {
      console.error("Failed to persist message:", error);
      // Don't throw - message is already in local state, persistence failure shouldn't break UX
    }
  },

  // -------------------- Streaming State --------------------

  appendStreamingText: (chatId: string, text: string) => {
    set((state) => {
      const chatStreaming = state.streamingMessages.get(chatId) ?? [];
      const lastMessage = chatStreaming[chatStreaming.length - 1];

      let updatedChatStreaming: StreamingMessage[];

      if (lastMessage?.type === "streaming_text") {
        updatedChatStreaming = [...chatStreaming];
        updatedChatStreaming[updatedChatStreaming.length - 1] = {
          ...lastMessage,
          text: lastMessage.text + text,
        };
      } else {
        updatedChatStreaming = [
          ...chatStreaming,
          {
            type: "streaming_text",
            id: generateMessageId("delta"),
            text,
            timestamp: new Date(),
          },
        ];
      }

      const newStreamingMessages = new Map(state.streamingMessages);
      newStreamingMessages.set(chatId, updatedChatStreaming);
      return { streamingMessages: newStreamingMessages };
    });
  },

  appendStreamingToolUse: (chatId: string, toolName: string, partialInput: string) => {
    set((state) => {
      const chatStreaming = state.streamingMessages.get(chatId) ?? [];
      const lastMessage = chatStreaming[chatStreaming.length - 1];

      let updatedChatStreaming: StreamingMessage[];

      if (
        lastMessage?.type === "streaming_tool_use" &&
        lastMessage.toolUseName === toolName
      ) {
        updatedChatStreaming = [...chatStreaming];
        updatedChatStreaming[updatedChatStreaming.length - 1] = {
          ...lastMessage,
          partialInput: lastMessage.partialInput + partialInput,
        };
      } else {
        updatedChatStreaming = [
          ...chatStreaming,
          {
            type: "streaming_tool_use",
            id: generateMessageId("delta"),
            toolUseName: toolName,
            partialInput,
            timestamp: new Date(),
          },
        ];
      }

      const newStreamingMessages = new Map(state.streamingMessages);
      newStreamingMessages.set(chatId, updatedChatStreaming);
      return { streamingMessages: newStreamingMessages };
    });
  },

  clearStreamingMessages: (chatId: string) => {
    set((state) => {
      const newStreamingMessages = new Map(state.streamingMessages);
      newStreamingMessages.delete(chatId);
      return { streamingMessages: newStreamingMessages };
    });
  },

  // -------------------- Task State --------------------

  addRunningTaskChat: (chatId: string) => {
    set((state) => {
      const newRunningTaskChatIds = new Set(state.runningTaskChatIds);
      newRunningTaskChatIds.add(chatId);
      return { runningTaskChatIds: newRunningTaskChatIds };
    });
  },

  removeRunningTaskChat: (chatId: string) => {
    set((state) => {
      const newRunningTaskChatIds = new Set(state.runningTaskChatIds);
      newRunningTaskChatIds.delete(chatId);
      return { runningTaskChatIds: newRunningTaskChatIds };
    });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  // -------------------- Computed Helpers --------------------

  /** Check if this tab has any running task */
  isTaskRunning: () => {
    return get().runningTaskChatIds.size > 0;
  },

  /** Check if a specific chat has a running task (local to this tab) */
  isChatRunning: (chatId: string | null) => {
    if (!chatId) return false;
    return get().runningTaskChatIds.has(chatId);
  },

  /** Get streaming messages for a specific chat */
  getStreamingMessages: (chatId: string | null) => {
    if (!chatId) return [];
    return get().streamingMessages.get(chatId) ?? [];
  },

  // -------------------- Multi-Tab Sync --------------------

  handleSyncEvent: (event: SyncEvent) => {
    switch (event.type) {
      case "chat_created":
        set((state) => {
          // Don't add if already exists
          if (state.chats.some((c) => c.id === event.chat.id)) {
            return state;
          }
          return { chats: [event.chat, ...state.chats] };
        });
        break;

      case "chat_updated":
        set((state) => {
          const updatedChats = state.chats.map((c) =>
            c.id === event.chat.id ? event.chat : c,
          );
          // Re-sort by updatedAt descending
          updatedChats.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          return { chats: updatedChats };
        });
        break;

      case "chat_deleted":
        set((state) => {
          const newStreamingMessages = new Map(state.streamingMessages);
          newStreamingMessages.delete(event.chatId);
          return {
            chats: state.chats.filter((c) => c.id !== event.chatId),
            activeChatId:
              state.activeChatId === event.chatId ? null : state.activeChatId,
            messages: state.activeChatId === event.chatId ? [] : state.messages,
            streamingMessages: newStreamingMessages,
          };
        });
        break;

      case "message_added": {
        const now = new Date().toISOString();
        set((state) => {
          // Update chat's updatedAt and move to top
          const updatedChats = state.chats.map((c) =>
            c.id === event.chatId ? { ...c, updatedAt: now } : c,
          );
          updatedChats.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );

          // Only add message if viewing the same chat
          if (state.activeChatId !== event.chatId) {
            return { chats: updatedChats };
          }
          // Don't add if already exists
          if (state.messages.some((m) => m.id === event.message.id)) {
            return { chats: updatedChats };
          }
          return {
            chats: updatedChats,
            messages: [...state.messages, transformMessage(event.message)],
          };
        });
        break;
      }

      case "message_deleted":
        set((state) => {
          // Only remove message if viewing the same chat
          if (state.activeChatId !== event.chatId) {
            return state;
          }
          return {
            messages: state.messages.filter((m) => m.id !== event.messageId),
          };
        });
        break;

      case "task_started":
        set((state) => {
          const newBusyChats = new Set(state.busyChats);
          newBusyChats.add(event.chatId);
          return { busyChats: newBusyChats };
        });
        break;

      case "task_ended":
        set((state) => {
          const newBusyChats = new Set(state.busyChats);
          newBusyChats.delete(event.chatId);
          // Also clear streaming messages for this chat (task from other tab ended)
          const newStreamingMessages = new Map(state.streamingMessages);
          newStreamingMessages.delete(event.chatId);
          return { busyChats: newBusyChats, streamingMessages: newStreamingMessages };
        });
        break;
    }
  },
}));
