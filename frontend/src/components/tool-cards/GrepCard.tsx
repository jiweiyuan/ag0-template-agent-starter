import { useState } from "react";
import { TextSearch } from "lucide-react";
import { ToolCardHeader } from "./ToolCardHeader";
import { extractResultText } from "./utils";
import type { BaseToolCardProps } from "./types";

export function GrepCard({ toolUse, toolResult, streaming }: BaseToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pattern = (toolUse.input.pattern as string) ?? (toolUse.input.query as string) ?? "";
  const result = toolResult ? extractResultText(toolResult) : "";
  const lines = result.trim().split("\n").filter(Boolean);
  const isError = toolResult?.isError ?? false;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 font-mono text-xs overflow-hidden">
      <ToolCardHeader
        icon={<TextSearch size={14} />}
        title="grep"
        subtitle={pattern}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        status={streaming ? "running" : isError ? "error" : "done"}
      />
      {isOpen && (
        <div className="border-t border-gray-200 bg-white">
          {isError ? (
            <div className="px-3 py-2 text-red-600">{result}</div>
          ) : lines.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-50">
              {lines.map((line, i) => {
                const colonIdx = line.indexOf(":");
                const file = colonIdx > 0 ? line.slice(0, colonIdx) : "";
                const rest = colonIdx > 0 ? line.slice(colonIdx) : line;
                return (
                  <li key={i} className="px-3 py-1 hover:bg-gray-50">
                    {file && <span className="text-blue-600">{file}</span>}
                    <span className="text-gray-700">{rest}</span>
                  </li>
                );
              })}
            </ul>
          ) : streaming ? (
            <div className="px-3 py-2 text-gray-400 italic">Searching...</div>
          ) : (
            <div className="px-3 py-2 text-gray-400">No matches found</div>
          )}
        </div>
      )}
    </div>
  );
}
