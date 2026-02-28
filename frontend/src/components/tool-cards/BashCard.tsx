import { useState } from "react";
import { Terminal } from "lucide-react";
import { cn } from "../../lib/utils";
import { ToolCardHeader } from "./ToolCardHeader";
import { extractResultText, stripAnsiCodes } from "./utils";
import type { BaseToolCardProps } from "./types";

export function BashCard({ toolUse, toolResult, streaming }: BaseToolCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const command = (toolUse.input.command as string) ?? (toolUse.input.cmd as string) ?? "";
  const description = toolUse.input.description as string | undefined;
  const output = toolResult ? stripAnsiCodes(extractResultText(toolResult)) : "";
  const isError = toolResult?.isError ?? false;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 font-mono text-xs overflow-hidden">
      <ToolCardHeader
        icon={<Terminal size={14} />}
        title={description ?? "bash"}
        subtitle={command}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        status={streaming ? "running" : isError ? "error" : "done"}
      />
      {isOpen && (
        <div className="border-t border-gray-200">
          {command && (
            <div className="px-3 py-2 bg-gray-900 text-gray-100">
              <span className="text-green-400">$ </span>
              <span>{command}</span>
            </div>
          )}
          {output && (
            <pre
              className={cn(
                "px-3 py-2 whitespace-pre-wrap break-all max-h-64 overflow-y-auto text-xs",
                isError ? "bg-red-50 text-red-700" : "bg-gray-950 text-gray-100"
              )}
            >
              {output}
            </pre>
          )}
          {!output && streaming && (
            <div className="px-3 py-2 bg-gray-950 text-gray-400 italic">Running...</div>
          )}
        </div>
      )}
    </div>
  );
}
