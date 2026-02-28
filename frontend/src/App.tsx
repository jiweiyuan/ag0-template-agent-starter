import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import type { Observable } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import type { ContentBlock } from "@zypher/ui";
import type { SyncEvent } from "ag0-core/types";
import {
  isMessage,
  type AgentWebSocketConnection,
  type TaskEvent,
} from "ag0-core/api";
import {
  useChatStore,
  type CompleteMessage,
} from "ag0-core/store";
import { Sidebar } from "./components/Sidebar";
import { ChatHeader } from "./components/ChatHeader";
import { Message, StreamingMessages } from "./components/Message";
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

export default function App() {
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("sidebarOpen");
    return saved !== null ? saved === "true" : false;
  });
  const connectionRef = useRef<AgentWebSocketConnection | null>(null);
  const pendingUserMessageRef = useRef<{ id: string; text: string } | null>(null);
  const hasAttemptedResumeRef = useRef(false);
  const hasInitialized = useRef(false);
  const handleTaskEventsRef = useRef<((events$: Observable<TaskEvent>, chatId: string) => Promise<void>) | null>(null);

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

  const streamingMessages = getStreamingMessages(activeChatId);
  const isChatBusy = activeChatId ? busyChats.has(activeChatId) : false;
  const isCurrentChatRunning = activeChatId !== null && runningTaskChatIds.has(activeChatId);

  const { scrollRef, isAtBottom, scrollToBottom } = useStickToBottom({
    deps: [messages, streamingMessages],
  });

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      init(apiClient);
      fetchChats();
    }
  }, [init, fetchChats]);

  const doCancelToEdit = useCallback(async (chatId: string) => {
    const pending = pendingUserMessageRef.current ?? getPendingMessage(chatId);
    if (pending) {
      try {
        await apiClient.deleteChatMessage(chatId, pending.id);
      } catch (err) {
        console.error("[cancel] Failed to delete message:", err);
      }
      removeMessage(pending.id);
      if (useChatStore.getState().activeChatId === chatId) {
        setInput(pending.text);
      }
      clearStreamingMessages(chatId);
      pendingUserMessageRef.current = null;
      clearPendingMessage(chatId);
    }
  }, [removeMessage, clearStreamingMessages]);

  useEffect(() => {
    const { close } = apiClient.connectSyncWebSocket(
      (event: SyncEvent) => {
        if (event.type === "task_cancel_requested") {
          if (runningTaskChatIds.has(event.chatId) && connectionRef.current) {
            connectionRef.current.cancelTask();
            connectionRef.current = null;
            doCancelToEdit(event.chatId);
          }
          return;
        }
        useChatStore.getState().handleSyncEvent(event);
      },
      { delay: 200 },
    );
    return () => { close(); };
  }, [runningTaskChatIds, doCancelToEdit]);

  const { toolResultMap, toolUseIdSet } = useMemo(() => buildToolMaps(messages), [messages]);
  const messageGroups = useMemo(
    () => groupConsecutiveMessages(messages, toolUseIdSet),
    [messages, toolUseIdSet]
  );

  const handleTaskEvents = useCallback(
    async (events$: Observable<TaskEvent>, chatId: string) => {
      const isViewingTaskChat = () => useChatStore.getState().activeChatId === chatId;

      try {
        for await (const e of eachValueFrom(events$)) {
          switch (e.type) {
            case "text":
              appendStreamingText(chatId, e.content);
              break;
            case "tool_use":
              appendStreamingToolUse(chatId, e.toolName, "");
              break;
            case "tool_use_input":
              appendStreamingToolUse(chatId, e.toolName, e.partialInput);
              break;
            case "message": {
              if (!isMessage(e.message)) {
                console.error("Invalid message format received");
                break;
              }
              const completeMessage: CompleteMessage = {
                type: "complete",
                id: generateMessageId("message"),
                role: e.message.role,
                content: e.message.content,
                timestamp: e.message.timestamp,
                checkpointId: e.message.checkpointId ?? null,
              };
              addCompleteMessage(chatId, completeMessage);
              if (e.message.role === "assistant") {
                persistMessage(chatId, e.message.role, e.message.content, e.message.checkpointId ?? null);
              }
              break;
            }
            case "history_changed": {
              const currentActiveChatId = useChatStore.getState().activeChatId;
              if (currentActiveChatId) {
                setActiveChat(currentActiveChatId);
              }
              break;
            }
            case "cancelled":
              console.log("Task cancelled:", e.reason);
              break;
            case "completed":
              break;
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
        removeRunningTaskChat(chatId);
        clearStreamingMessages(chatId);
        pendingUserMessageRef.current = null;
        clearPendingMessage(chatId);
        apiClient.notifyTaskEnded(chatId);
      }
    },
    [appendStreamingText, appendStreamingToolUse, addCompleteMessage, persistMessage, setActiveChat, setError, removeRunningTaskChat, clearStreamingMessages]
  );

  handleTaskEventsRef.current = handleTaskEvents;

  const checkRunningTasks = useCallback(async () => {
    try {
      const { agents } = await apiClient.getActiveAgents();
      const runningAgents = agents.filter((a) => a.isTaskRunning);
      if (runningAgents.length === 0) return;

      for (const agent of runningAgents) {
        const pendingMsg = getPendingMessage(agent.chatId);
        const thisTabStartedTask = pendingMsg !== null;

        if (thisTabStartedTask) {
          setActiveChat(agent.chatId);
          addRunningTaskChat(agent.chatId);
          pendingUserMessageRef.current = pendingMsg;

          try {
            const { connection, events$ } = await apiClient.resumeTaskForChat(agent.chatId);
            connectionRef.current = connection;
            apiClient.notifyTaskStarted(agent.chatId);
            handleTaskEventsRef.current?.(events$, agent.chatId);
          } catch (err) {
            console.error(`[App] Failed to resume task for chat ${agent.chatId}:`, err);
            removeRunningTaskChat(agent.chatId);
          }
        } else {
          useChatStore.getState().handleSyncEvent({ type: "task_started", chatId: agent.chatId });
        }
      }
    } catch (err) {
      console.error("Failed to check running tasks:", err);
    }
  }, [setActiveChat, addRunningTaskChat, removeRunningTaskChat]);

  useEffect(() => {
    if (!hasAttemptedResumeRef.current && hasInitialized.current) {
      hasAttemptedResumeRef.current = true;
      checkRunningTasks();
    }
  }, [checkRunningTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isCurrentChatRunning || isChatBusy) return;

    const userMessage = input.trim();
    setInput("");
    scrollToBottom();
    setError(null);

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

    addRunningTaskChat(chatId);
    const isFirstMessage = messages.length === 0;
    const userContent: ContentBlock[] = [{ type: "text", text: userMessage }];

    try {
      const savedMessage = await apiClient.addChatMessage(chatId, "user", userContent);
      addMessage({
        type: "complete",
        id: savedMessage.id,
        role: savedMessage.role,
        content: savedMessage.content,
        timestamp: new Date(savedMessage.createdAt),
        checkpointId: savedMessage.checkpointId,
      });

      const pendingMsg = { id: savedMessage.id, text: userMessage };
      pendingUserMessageRef.current = pendingMsg;
      savePendingMessage(chatId, pendingMsg);

      const { connection, events$ } = await apiClient.startTaskForChat(chatId, userMessage, {
        excludeMessageId: savedMessage.id,
      });
      connectionRef.current = connection;
      apiClient.notifyTaskStarted(chatId);

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
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <ChatHeader onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />

        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Busy banner */}
          {isChatBusy && (
            <div className="mx-4 mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800 text-sm shrink-0">
              <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>This chat has a task running in another tab</span>
            </div>
          )}

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                Loading messages...
              </div>
            ) : messages.length === 0 && streamingMessages.length === 0 && !isCurrentChatRunning ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                Start a conversation
              </div>
            ) : null}

            {messageGroups.map((group, groupIdx) => {
              const isUser = group.role === "user";
              const isLastGroup = groupIdx === messageGroups.length - 1;
              const showStreamingHere =
                isLastGroup && !isUser && (streamingMessages.length > 0 || isCurrentChatRunning);

              return (
                <div
                  key={group.id}
                  className={`rounded-xl px-4 py-3 ${
                    isUser
                      ? "bg-blue-50 ml-12 border border-blue-100"
                      : "bg-white border border-gray-200 mr-12"
                  }`}
                >
                  {group.messages.map((msg, idx) => (
                    <div key={msg.id} className={idx > 0 ? "mt-3 pt-3 border-t border-gray-100" : ""}>
                      <Message
                        content={msg.content}
                        toolResultMap={toolResultMap}
                        toolUseIdSet={toolUseIdSet}
                      />
                    </div>
                  ))}
                  {showStreamingHere && streamingMessages.length > 0 && (
                    <div className="mt-3">
                      <StreamingMessages messages={streamingMessages} />
                    </div>
                  )}
                  {showStreamingHere && isCurrentChatRunning && streamingMessages.length === 0 && (
                    <div className="mt-3 flex items-center gap-2 text-gray-400 text-sm">
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" />
                      <span>Thinking...</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Standalone streaming bubble when no assistant group exists yet */}
            {(messageGroups.length === 0 || messageGroups[messageGroups.length - 1].role === "user") && (
              <>
                {streamingMessages.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mr-12">
                    <StreamingMessages messages={streamingMessages} />
                  </div>
                )}
                {isCurrentChatRunning && streamingMessages.length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mr-12">
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <ScrollToBottomButton visible={!isAtBottom} onClick={scrollToBottom} />

          {/* Input area */}
          <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
            {error && (
              <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isCurrentChatRunning ? "Task running..." : "Ask the agent..."}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isCurrentChatRunning}
              />
              {isCurrentChatRunning || isChatBusy ? (
                <button
                  type="button"
                  onClick={isCurrentChatRunning ? handleCancel : handleCancelRemote}
                  className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              )}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
