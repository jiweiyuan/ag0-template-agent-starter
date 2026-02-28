import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { useChatStore } from "ag0-core/store";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { chats, chatsLoading, activeChatId, createChat, setActiveChat, deleteChat } = useChatStore();

  const handleNewChat = async () => {
    const chat = await createChat("New Chat");
    await setActiveChat(chat.id);
  };

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (confirm("Delete this chat?")) {
      await deleteChat(chatId);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={onToggle}
        />
      )}

      <div
        className={cn(
          "flex flex-col bg-gray-50 border-r border-gray-200 transition-all duration-200 shrink-0 z-30",
          isOpen ? "w-64" : "w-0 overflow-hidden"
        )}
      >
        <div className="flex items-center justify-between p-3 border-b border-gray-200 shrink-0">
          <span className="text-sm font-semibold text-gray-700">Chats</span>
          <Button variant="ghost" size="sm" onClick={handleNewChat} className="h-7 w-7 p-0">
            <Plus size={16} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {chatsLoading && chats.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-400">
              Loading...
            </div>
          ) : chats.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-400">
              No chats yet
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setActiveChat(chat.id)}
                className={cn(
                  "group flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-gray-100",
                  activeChatId === chat.id
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700"
                )}
              >
                <MessageSquare size={14} className="shrink-0 opacity-60" />
                <span className="flex-1 truncate">{chat.title ?? "New Chat"}</span>
                <span
                  role="button"
                  onClick={(e) => handleDelete(e, chat.id)}
                  className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 size={12} />
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
