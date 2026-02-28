import { useEffect } from "react";
import { ChatListItem } from "./ChatListItem";
import { useChatStore } from "ag0-core/store";

export function ChatList() {
  const { chats, chatsLoading, fetchChats, activeChatId, setActiveChat } =
    useChatStore();

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  if (chatsLoading && chats.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        Loading chats...
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        No chats yet. Start a new conversation!
      </div>
    );
  }

  return (
    <div className="py-2">
      {chats.map((chat) => (
        <ChatListItem
          key={chat.id}
          chat={chat}
          isActive={chat.id === activeChatId}
          onSelect={() => setActiveChat(chat.id)}
        />
      ))}
    </div>
  );
}
