import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import type { Observable } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { Streamdown } from "streamdown";
import type { ContentBlock, ToolResultBlock } from "@zypher/ui";
import type { SyncEvent } from "ag0-core/types";
import {
  isMessage,
  type AgentWebSocketConnection,
  type TaskEvent,
} from "ag0-core/api";
import {
  useChatStore,
  type CompleteMessage,
  type StreamingMessage,
} from "ag0-core/store";
import { Sidebar } from "./components/Sidebar";
import { ChatHeader } from "./components/ChatHeader";
import { ToolCard, StreamingToolCard } from "./components/ToolCard";
import { ScrollToBottomButton } from "./components/ScrollToBottomButton";
import { useStickToBottom } from "./hooks/useStickToBottom";
import { buildToolMaps, groupConsecutiveMessages } from "ag0-core/message-helpers";
import {
  savePendingMessage,
  getPendingMessage,
  clearPendingMessage,
} from "ag0-core/pending-message";
import { apiClient } from "ag0-core/session";
import { generateMessageId } from "ag0-core/utils";

// ============================================================================
// Message Rendering Helpers
// ============================================================================

function renderContentBlocks(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ToolResultBlock>,
  toolUseIdSet: Set<string>
) {
  const rendered: React.ReactNode[] = [];
  const renderedToolResultIds = new Set<string>();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    switch (block.type) {
      case "text":
        rendered.push(
          <div key={i} className="prose prose-sm max-w-none">
            <Streamdown controls>{block.text}</Streamdown>
          </div>
        );
        break;

      case "tool_use": {
        const toolResult = toolResultMap.get(block.toolUseId);
        if (toolResult) {
          renderedToolResultIds.add(block.toolUseId);
        }
        rendered.push(
          <ToolCard
            key={`tool-${block.toolUseId}`}
            name={block.name}
            input={block.input}
            result={toolResult}
          />
        );
        break;
      }

      case "tool_result":
        if (renderedToolResultIds.has(block.toolUseId) || toolUseIdSet.has(block.toolUseId)) {
          break;
        }
        rendered.push(
          <ToolCard
            key={`result-${block.toolUseId}`}
            name={block.name}
            input={block.input}
            result={block}
          />
        );
        break;
    }
  }

  return rendered;
}

function renderStreamingMessages(streamingMessages: StreamingMessage[]) {
  return streamingMessages.map((msg) => {
    if (msg.type === "streaming_text") {
      return (
        <div key={msg.id} className="prose prose-sm max-w-none">
          <Streamdown controls mode="streaming" isAnimating>
            {msg.text}
          </Streamdown>
        </div>
      );
    } else {
      return (
        <StreamingToolCard
          key={msg.id}
          name={msg.toolUseName}
          partialInput={msg.partialInput}
        />
      );
    }
  });
}

// ============================================================================
// Main App Component
// ============================================================================

export default function App() {
  const [input, setInput] = useState("");
  // Initialize sidebar state from localStorage, default to closed
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("sidebarOpen");
    return saved !== null ? saved === "true" : false;
  });
  const connectionRef = useRef<AgentWebSocketConnection | null>(null);
  const pendingUserMessageRef = useRef<{ id: string; text: string } | null>(null);
  const hasAttemptedResumeRef = useRef(false);
  const hasInitialized = useRef(false);
  // Ref to hold handleTaskEvents to avoid TDZ issues in checkRunningTasks
  const handleTaskEventsRef = useRef<((events$: Observable<TaskEvent>, chatId: string) => Promise<void>) | null>(null);

  // Zustand store
  const {
    init,
    fetchChats,
    activeChatId,
    createChat,
    setActiveChat,
    messages,
    messagesLoading,
    runningTaskChatIds,
    error,
    busyChats,
    addMessage,
    addCompleteMessage,
    removeMessage,
    persistMessage,
    appendStreamingText,
    appendStreamingToolUse,
    clearStreamingMessages,
    addRunningTaskChat,
    removeRunningTaskChat,
    setError,
    getStreamingMessages,
  } = useChatStore();

  // Derived state
  const streamingMessages = getStreamingMessages(activeChatId);
  // Check if current chat is busy (task running in another tab)
  const isChatBusy = activeChatId ? busyChats.has(activeChatId) : false;
  // Check if current chat has a running task in this tab (must have an active chat)
  const isCurrentChatRunning = activeChatId !== null && runningTaskChatIds.has(activeChatId);

  // Auto-scroll hook
  const { scrollRef, isAtBottom, scrollToBottom } = useStickToBottom({
    deps: [messages, streamingMessages],
  });

  // Initialize store with API client
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      init(apiClient);
      fetchChats();
    }
  }, [init, fetchChats]);

  // Cancel-to-edit: restore user message to input field
  // Extracted so it can be called from both local cancel and remote cancel
  const doCancelToEdit = useCallback(async (chatId: string) => {
    // Try ref first (same tab), then localStorage (after refresh)
    const pending = pendingUserMessageRef.current ?? getPendingMessage(chatId);
    if (pending) {
      try {
        // Delete from DB
        await apiClient.deleteChatMessage(chatId, pending.id);
      } catch (err) {
        // Log but don't block - still restore to input
        console.error("[cancel] Failed to delete message:", err);
      }

      // Remove from UI
      removeMessage(pending.id);

      // Restore to input (only if viewing the same chat)
      if (useChatStore.getState().activeChatId === chatId) {
        setInput(pending.text);
      }

      // Clear streaming messages
      clearStreamingMessages(chatId);

      // Clear pending state (both ref and localStorage)
      pendingUserMessageRef.current = null;
      clearPendingMessage(chatId);
    }
  }, [removeMessage, clearStreamingMessages]);

  // Connect to sync WebSocket for real-time chat list updates
  // Small delay (200ms) to avoid race condition on startup
  useEffect(() => {
    const { close } = apiClient.connectSyncWebSocket(
      (event: SyncEvent) => {
        // Handle cancel request from another tab
        if (event.type === "task_cancel_requested") {
          // Only cancel if this tab is running a task for that chat
          if (
            runningTaskChatIds.has(event.chatId) &&
            connectionRef.current
          ) {
            console.log(`[sync] Cancelling task for chat ${event.chatId} (requested by another tab)`);
            connectionRef.current.cancelTask();
            connectionRef.current = null;
            // Perform cancel-to-edit: delete message, restore to input
            doCancelToEdit(event.chatId);
          }
          return;
        }
        useChatStore.getState().handleSyncEvent(event);
      },
      { delay: 200 },
    );

    return () => {
      close();
    };
  }, [runningTaskChatIds, doCancelToEdit]);

  const { toolResultMap, toolUseIdSet } = useMemo(() => buildToolMaps(messages), [messages]);
  const messageGroups = useMemo(
    () => groupConsecutiveMessages(messages, toolUseIdSet),
    [messages, toolUseIdSet]
  );

  // Handle task events using async iterator
  const handleTaskEvents = useCallback(
    async (events$: Observable<TaskEvent>, chatId: string) => {
      // Helper to check if we're still viewing the chat this task belongs to
      const isViewingTaskChat = () => useChatStore.getState().activeChatId === chatId;

      try {
        for await (const e of eachValueFrom(events$)) {
          switch (e.type) {
            case "text": {
              // Always append to the task's chat (streaming is per-chat now)
              appendStreamingText(chatId, e.content);
              break;
            }

            case "tool_use": {
              appendStreamingToolUse(chatId, e.toolName, "");
              break;
            }

            case "tool_use_input": {
              appendStreamingToolUse(chatId, e.toolName, e.partialInput);
              break;
            }

            case "message": {
              // Validate and convert message (handles string -> Date for timestamp)
              if (!isMessage(e.message)) {
                console.error("Invalid message format received");
                break;
              }
              // Create complete message
              const completeMessage: CompleteMessage = {
                type: "complete",
                id: generateMessageId("message"),
                role: e.message.role,
                content: e.message.content,
                timestamp: e.message.timestamp,
                checkpointId: e.message.checkpointId ?? null,
              };
              // Add to UI (will only show if viewing this chat)
              addCompleteMessage(chatId, completeMessage);
              // Always persist assistant messages to DB
              if (e.message.role === "assistant") {
                persistMessage(
                  chatId,
                  e.message.role,
                  e.message.content,
                  e.message.checkpointId ?? null,
                );
              }
              break;
            }

            case "history_changed": {
              // History was modified - refetch messages for active chat
              const currentActiveChatId = useChatStore.getState().activeChatId;
              if (currentActiveChatId) {
                setActiveChat(currentActiveChatId);
              }
              break;
            }

            case "cancelled": {
              console.log("Task cancelled:", e.reason);
              break;
            }

            case "completed": {
              break;
            }

            case "error":
              if (isViewingTaskChat()) {
                setError(e.error);
              }
              break;
          }
        }
      } catch (err) {
        console.error("Task error:", err);
      } finally {
        // Clear task running state for this chat
        removeRunningTaskChat(chatId);
        // Clear streaming messages for this chat
        clearStreamingMessages(chatId);
        // Clear pending user message (task completed, no need to restore on cancel)
        pendingUserMessageRef.current = null;
        clearPendingMessage(chatId);
        // Always notify other tabs that task ended
        apiClient.notifyTaskEnded(chatId);
      }
    },
    [appendStreamingText, appendStreamingToolUse, addCompleteMessage, persistMessage, setActiveChat, setError, removeRunningTaskChat, clearStreamingMessages]
  );

  // Keep ref updated for checkRunningTasks to use
  handleTaskEventsRef.current = handleTaskEvents;

  // Check for active agents and handle auto-resume or mark as busy
  // Auto-resume ONLY if this tab has a pending message in sessionStorage for the chat
  // (sessionStorage is per-tab and survives refresh, so this identifies the originating tab)
  // Otherwise, mark as busy (task running in another tab)
  const checkRunningTasks = useCallback(async () => {
    try {
      // Check server for any active agents with running tasks
      const { agents } = await apiClient.getActiveAgents();
      const runningAgents = agents.filter((a) => a.isTaskRunning);

      if (runningAgents.length === 0) {
        return;
      }

      for (const agent of runningAgents) {
        // Check if this tab started the task (has pending message in sessionStorage)
        // sessionStorage is per-tab and survives refresh, so this is reliable
        const pendingMsg = getPendingMessage(agent.chatId);
        const thisTabStartedTask = pendingMsg !== null;

        if (thisTabStartedTask) {
          // Auto-resume: this tab started the task, reconnect to the stream
          console.log(`[App] Resuming task for chat ${agent.chatId} (this tab started it)`);

          // Navigate to the chat that has the running task
          setActiveChat(agent.chatId);

          // Mark as running in this tab
          addRunningTaskChat(agent.chatId);

          // Restore pending message ref (for cancel-to-edit)
          pendingUserMessageRef.current = pendingMsg;

          // Connect to task stream
          try {
            const { connection, events$ } = await apiClient.resumeTaskForChat(agent.chatId);
            connectionRef.current = connection;

            // Notify server that this tab is now handling the task
            apiClient.notifyTaskStarted(agent.chatId);

            // Handle events (same as startTask)
            handleTaskEventsRef.current?.(events$, agent.chatId);
          } catch (err) {
            console.error(`[App] Failed to resume task for chat ${agent.chatId}:`, err);
            removeRunningTaskChat(agent.chatId);
          }
        } else {
          // Another tab started this task - mark as busy
          useChatStore.getState().handleSyncEvent({
            type: "task_started",
            chatId: agent.chatId,
          });
          console.log(`[App] Chat ${agent.chatId} has task running in another tab, marked as busy`);
        }
      }
    } catch (err) {
      console.error("Failed to check running tasks:", err);
    }
  }, [setActiveChat, addRunningTaskChat, removeRunningTaskChat]);

  // Check for running tasks ONLY ONCE after initialization
  useEffect(() => {
    if (!hasAttemptedResumeRef.current && hasInitialized.current) {
      hasAttemptedResumeRef.current = true;
      checkRunningTasks();
    }
  }, [checkRunningTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only block if THIS chat has a running task (local or from another tab)
    if (!input.trim() || isCurrentChatRunning || isChatBusy) return;

    const userMessage = input.trim();
    setInput("");
    scrollToBottom();
    setError(null);

    // If no active chat, create one first
    let chatId = activeChatId;
    if (!chatId) {
      try {
        const newChat = await createChat("New Chat");
        chatId = newChat.id;
        await setActiveChat(chatId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create chat");
        return;
      }
    }

    // Mark task as running for this chat
    addRunningTaskChat(chatId);

    // Check if this is the first message (for title generation)
    const isFirstMessage = messages.length === 0;

    // Create message content
    const userContent: ContentBlock[] = [{ type: "text", text: userMessage }];

    try {
      // Persist user message FIRST to get the real message ID
      const savedMessage = await apiClient.addChatMessage(chatId, "user", userContent);

      // Add to UI with real ID
      addMessage({
        type: "complete",
        id: savedMessage.id,
        role: savedMessage.role,
        content: savedMessage.content,
        timestamp: new Date(savedMessage.createdAt),
        checkpointId: savedMessage.checkpointId,
      });

      // Track pending message for cancel-to-edit (both ref and localStorage for refresh survival)
      const pendingMsg = { id: savedMessage.id, text: userMessage };
      pendingUserMessageRef.current = pendingMsg;
      savePendingMessage(chatId, pendingMsg);

      // Use chat-specific agent endpoint with excludeMessageId to avoid duplicate in initialMessages
      const { connection, events$ } = await apiClient.startTaskForChat(chatId, userMessage, {
        excludeMessageId: savedMessage.id,
      });
      connectionRef.current = connection;

      // Notify other tabs that task started
      apiClient.notifyTaskStarted(chatId);

      // Generate title on first message (fire and forget)
      if (isFirstMessage) {
        apiClient.generateTitle(chatId, userMessage);
      }

      handleTaskEvents(events$, chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      removeRunningTaskChat(chatId);
    }
  };

  const handleCancel = async () => {
    if (connectionRef.current) {
      connectionRef.current.cancelTask();
      connectionRef.current = null;
    }

    if (activeChatId) {
      await doCancelToEdit(activeChatId);
    }
  };

  const handleCancelRemote = () => {
    if (activeChatId) {
      apiClient.cancelChatTask(activeChatId);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const newState = !prev;
      localStorage.setItem("sidebarOpen", String(newState));
      return newState;
    });
  };

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />

      <div className={`main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <ChatHeader onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />

        <main className="flex-1 container mx-auto max-w-2xl p-6 flex flex-col overflow-hidden relative">
          {/* Banner for chat busy in another tab */}
          {isChatBusy && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800">
              <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span>This chat has a task running in another tab</span>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-4 mb-6 overflow-y-auto">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                Loading messages...
              </div>
            ) : messages.length === 0 && streamingMessages.length === 0 && !isCurrentChatRunning ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                Start a conversation
              </div>
            ) : null}

            {messageGroups.map((group, groupIdx) => {
              const isUser = group.role === "user";
              const isLastGroup = groupIdx === messageGroups.length - 1;
              const showStreamingHere = isLastGroup && !isUser && (streamingMessages.length > 0 || isCurrentChatRunning);

              return (
                <div
                  key={group.id}
                  className={`p-3 rounded-lg ${
                    isUser ? "bg-blue-100 ml-12" : "bg-white border mr-12"
                  }`}
                >
                  {group.messages.map((msg, idx) => (
                    <div key={msg.id} className={idx > 0 ? "mt-3" : ""}>
                      {renderContentBlocks(msg.content, toolResultMap, toolUseIdSet)}
                    </div>
                  ))}
                  {showStreamingHere && streamingMessages.length > 0 && (
                    <div className="mt-3">
                      {renderStreamingMessages(streamingMessages)}
                    </div>
                  )}
                  {showStreamingHere && isCurrentChatRunning && streamingMessages.length === 0 && (
                    <div className="mt-3 flex items-center gap-2 text-gray-500">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                      <span>Thinking...</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show streaming/thinking in separate bubble only when no assistant group exists */}
            {(messageGroups.length === 0 || messageGroups[messageGroups.length - 1].role === "user") && (
              <>
                {streamingMessages.length > 0 && (
                  <div className="p-4 bg-white border rounded-lg mr-12">
                    {renderStreamingMessages(streamingMessages)}
                  </div>
                )}
                {isCurrentChatRunning && streamingMessages.length === 0 && (
                  <div className="p-4 bg-white border rounded-lg mr-12">
                    <div className="flex items-center gap-2 text-gray-500">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <ScrollToBottomButton
            visible={!isAtBottom}
            onClick={scrollToBottom}
          />

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isCurrentChatRunning}
            />
            {isCurrentChatRunning || isChatBusy ? (
              <button
                type="button"
                onClick={isCurrentChatRunning ? handleCancel : handleCancelRemote}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}
