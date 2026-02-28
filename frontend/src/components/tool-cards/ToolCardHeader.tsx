import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface ToolCardHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  status?: "running" | "done" | "error";
  className?: string;
}

export function ToolCardHeader({
  icon, title, subtitle, isOpen, onToggle, status, className
}: ToolCardHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium",
        "hover:bg-gray-50 transition-colors rounded-t-md",
        !isOpen && "rounded-b-md",
        className
      )}
    >
      <span className="text-gray-500 shrink-0">{icon}</span>
      <span className="flex-1 truncate text-gray-700">{title}</span>
      {subtitle && (
        <span className="truncate text-xs text-gray-400 max-w-[200px]">{subtitle}</span>
      )}
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
      )}
      {status === "error" && (
        <span className="text-xs text-red-500 shrink-0">error</span>
      )}
      <span className="text-gray-400 shrink-0">
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
    </button>
  );
}
