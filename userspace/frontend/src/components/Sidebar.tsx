import { ChatList } from "./ChatList";
import { useChatStore } from "ag0-core/store";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { setActiveChat } = useChatStore();

  const handleNewChat = () => {
    setActiveChat(null);
  };

  return (
    <>
      {/* Overlay when sidebar is open (mobile and desktop) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar fixed inset-y-0 left-0 z-30 bg-gray-900 text-white transform transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header with New Chat button and collapse button */}
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewChat}
                className="flex-1 flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New Chat
              </button>
              {/* Collapse button */}
              <button
                onClick={onToggle}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
                title="Collapse sidebar"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {/* Sidebar panel icon with left arrow (collapse) */}
                  <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
                  <line x1="9" y1="3" x2="9" y2="21" strokeWidth={2} />
                  <polyline points="16,9 13,12 16,15" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chat list */}
          <div className="flex-1 overflow-y-auto">
            <ChatList />
          </div>
        </div>
      </aside>
    </>
  );
}
