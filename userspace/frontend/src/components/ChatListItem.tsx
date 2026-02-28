import { useState, useRef, useEffect } from "react";
import type { Chat } from "ag0-core/types";
import { useChatStore } from "ag0-core/store";

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
  onSelect: () => void;
}

export function ChatListItem({ chat, isActive, onSelect }: ChatListItemProps) {
  const { renameChat, deleteChat, runningTaskChatIds, busyChats } = useChatStore();
  // Chat is busy if it has a task running locally or from another tab
  const isChatBusy = runningTaskChatIds.has(chat.id) || busyChats.has(chat.id);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isMenuOpen]);

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== chat.title) {
      renameChat(chat.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (confirm("Delete this chat? This cannot be undone.")) {
      deleteChat(chat.id);
    }
    setIsMenuOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setEditTitle(chat.title);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`group relative mx-2 mb-1 rounded-lg ${
        isActive ? "bg-gray-700" : "hover:bg-gray-800"
      } ${isMenuOpen ? "z-50" : ""}`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={handleKeyDown}
          aria-label="Chat title"
          className="w-full px-3 py-2 bg-gray-800 text-white text-sm rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
        />
      ) : (
        <button
          onClick={onSelect}
          className="w-full text-left px-3 py-2 pr-14 text-sm text-gray-200 truncate"
        >
          {chat.title}
        </button>
      )}

      {/* Running task spinner - fixed position on the right */}
      {!isEditing && isChatBusy && (
        <div className="absolute right-7 top-1/2 -translate-y-1/2">
          <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin block" />
        </div>
      )}

      {/* Options button */}
      {!isEditing && (
        <div
          ref={menuRef}
          className={`absolute right-1 top-1/2 -translate-y-1/2 ${
            isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            aria-label="Chat options"
            className="p-1 text-gray-400 hover:text-white rounded"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-1 w-32 bg-gray-900 rounded-lg shadow-xl border border-gray-600 py-1 z-50">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
              >
                Rename
              </button>
              <button
                onClick={handleDelete}
                disabled={isChatBusy}
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
