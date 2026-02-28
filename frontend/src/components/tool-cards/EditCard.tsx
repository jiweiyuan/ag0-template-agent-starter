import { useState } from "react";
import { FilePen } from "lucide-react";
import { ToolCardHeader } from "./ToolCardHeader";
import { extractFilePath, getFileNameFromPath, extractResultText } from "./utils";
import type { BaseToolCardProps } from "./types";

export function EditCard({ toolUse, toolResult, streaming }: BaseToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filePath = extractFilePath(toolUse.input);
  const fileName = getFileNameFromPath(filePath);
  const oldString = (toolUse.input.old_string as string) ?? "";
  const newString = (toolUse.input.new_string as string) ?? "";
  const result = toolResult ? extractResultText(toolResult) : "";
  const isError = toolResult?.isError ?? false;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 font-mono text-xs overflow-hidden">
      <ToolCardHeader
        icon={<FilePen size={14} />}
        title="edit_file"
        subtitle={fileName || filePath}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        status={streaming ? "running" : isError ? "error" : "done"}
      />
      {isOpen && (
        <div className="border-t border-gray-200 bg-white">
          {toolResult && isError ? (
            <div className="px-3 py-2 text-red-600">{result}</div>
          ) : toolResult ? (
            <div className="px-3 py-2 text-green-700">File edited successfully</div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
              {oldString && (
                <div className="bg-red-50">
                  {oldString.split("\n").map((line, i) => (
                    <div key={i} className="flex">
                      <span className="select-none px-2 text-red-400 border-r border-red-100 w-6 text-center">−</span>
                      <pre className="px-3 whitespace-pre text-red-800">{line}</pre>
                    </div>
                  ))}
                </div>
              )}
              {newString && (
                <div className="bg-green-50">
                  {newString.split("\n").map((line, i) => (
                    <div key={i} className="flex">
                      <span className="select-none px-2 text-green-400 border-r border-green-100 w-6 text-center">+</span>
                      <pre className="px-3 whitespace-pre text-green-800">{line}</pre>
                    </div>
                  ))}
                </div>
              )}
              {streaming && !oldString && (
                <div className="px-3 py-2 text-gray-400 italic">Editing...</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
