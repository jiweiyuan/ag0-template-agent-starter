import { useState } from "react";
import { Wrench } from "lucide-react";
import { ToolCardHeader } from "./ToolCardHeader";
import { extractResultText, formatJson } from "./utils";
import type { BaseToolCardProps } from "./types";

export function DefaultCard({ toolUse, toolResult, streaming }: BaseToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const result = toolResult ? extractResultText(toolResult) : "";
  const isError = toolResult?.isError ?? false;
  const inputStr = Object.keys(toolUse.input).length > 0
    ? formatJson(toolUse.input)
    : "";

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 font-mono text-xs overflow-hidden">
      <ToolCardHeader
        icon={<Wrench size={14} />}
        title={toolUse.name}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        status={streaming ? "running" : isError ? "error" : "done"}
      />
      {isOpen && (
        <div className="border-t border-gray-200 bg-white divide-y divide-gray-100">
          {inputStr && (
            <pre className="px-3 py-2 text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {inputStr}
            </pre>
          )}
          {result && (
            <pre className={`px-3 py-2 whitespace-pre-wrap max-h-48 overflow-y-auto ${isError ? "text-red-600 bg-red-50" : "text-gray-800"}`}>
              {result}
            </pre>
          )}
          {streaming && !result && (
            <div className="px-3 py-2 text-gray-400 italic">Running...</div>
          )}
        </div>
      )}
    </div>
  );
}
