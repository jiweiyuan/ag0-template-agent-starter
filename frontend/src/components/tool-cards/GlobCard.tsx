import { useState } from "react";
import { Search } from "lucide-react";
import { ToolCardHeader } from "./ToolCardHeader";
import { extractResultText } from "./utils";
import type { BaseToolCardProps } from "./types";

export function GlobCard({ toolUse, toolResult, streaming }: BaseToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pattern = (toolUse.input.pattern as string) ?? (toolUse.input.glob as string) ?? "";
  const result = toolResult ? extractResultText(toolResult) : "";
  const files = result.trim().split("\n").filter(Boolean);
  const isError = toolResult?.isError ?? false;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 font-mono text-xs overflow-hidden">
      <ToolCardHeader
        icon={<Search size={14} />}
        title="glob"
        subtitle={pattern}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        status={streaming ? "running" : isError ? "error" : "done"}
      />
      {isOpen && (
        <div className="border-t border-gray-200 bg-white">
          {isError ? (
            <div className="px-3 py-2 text-red-600">{result}</div>
          ) : files.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-50">
              {files.map((f, i) => (
                <li key={i} className="px-3 py-1 text-gray-700 hover:bg-gray-50">{f}</li>
              ))}
            </ul>
          ) : streaming ? (
            <div className="px-3 py-2 text-gray-400 italic">Searching...</div>
          ) : (
            <div className="px-3 py-2 text-gray-400">No files found</div>
          )}
        </div>
      )}
    </div>
  );
}
