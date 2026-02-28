import { ChevronDown } from "lucide-react";

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToBottomButton({ visible, onClick }: ScrollToBottomButtonProps) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 p-2 bg-white border border-gray-300 rounded-full shadow-md hover:bg-gray-50 transition-colors text-gray-600"
      aria-label="Scroll to bottom"
    >
      <ChevronDown size={20} />
    </button>
  );
}
