import { useState, useRef, useEffect } from "react";
import { useChatStore } from "ag0-core/store";

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function ChatHeader({ onToggleSidebar, sidebarOpen }: ChatHeaderProps) {
  const { chats, activeChatId, renameChat } = useChatStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (activeChat) {
      setEditTitle(activeChat.title);
    }
  }, [activeChat]);

  const handleRename = () => {
    if (activeChat && editTitle.trim() && editTitle !== activeChat.title) {
      renameChat(activeChat.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setEditTitle(activeChat?.title ?? "");
      setIsEditing(false);
    }
  };

  return (
    <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
      {/* Menu button - shown when sidebar is closed */}
      <button
        onClick={onToggleSidebar}
        className={`p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors ${sidebarOpen ? "lg:hidden" : ""}`}
        title="Open sidebar"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {/* Sidebar panel icon with right arrow (expand) */}
          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
          <line x1="9" y1="3" x2="9" y2="21" strokeWidth={2} />
          <polyline points="13,9 16,12 13,15" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {activeChatId && activeChat ? (
          isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyDown}
              aria-label="Chat title"
              className="w-full max-w-md px-2 py-1 text-lg font-semibold text-gray-900 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-lg font-semibold text-gray-900 hover:text-blue-600 truncate max-w-md block"
              title="Click to rename"
            >
              {activeChat.title}
            </button>
          )
        ) : (
          <h1 className="text-lg font-semibold text-gray-900">New Chat</h1>
        )}
      </div>
    </header>
  );
}
