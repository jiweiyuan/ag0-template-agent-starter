import { useState, useRef, useEffect } from "react";
import { PanelLeft } from "lucide-react";
import { useChatStore } from "ag0-core/store";
import { Button } from "./ui/button";

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
    if (e.key === "Enter") handleRename();
    else if (e.key === "Escape") {
      setEditTitle(activeChat?.title ?? "");
      setIsEditing(false);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        className={`h-8 w-8 text-gray-600 ${sidebarOpen ? "lg:hidden" : ""}`}
        title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        <PanelLeft size={18} />
      </Button>

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
              className="w-full max-w-md px-2 py-1 text-base font-semibold text-gray-900 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-base font-semibold text-gray-900 hover:text-blue-600 truncate max-w-md block"
              title="Click to rename"
            >
              {activeChat.title}
            </button>
          )
        ) : (
          <h1 className="text-base font-semibold text-gray-900">New Chat</h1>
        )}
      </div>
    </header>
  );
}
