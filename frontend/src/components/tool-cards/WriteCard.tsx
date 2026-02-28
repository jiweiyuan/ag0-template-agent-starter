import { useState } from "react";
import { FilePlus } from "lucide-react";
import { ToolCardHeader } from "./ToolCardHeader";
import { extractFilePath, getFileNameFromPath, extractResultText } from "./utils";
import type { BaseToolCardProps } from "./types";

export function WriteCard({ toolUse, toolResult, streaming }: BaseToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filePath = extractFilePath(toolUse.input);
  const fileName = getFileNameFromPath(filePath);
  const content = (toolUse.input.content as string) ?? "";
  const result = toolResult ? extractResultText(toolResult) : "";
  const isError = toolResult?.isError ?? false;
  const lines = content.split("\n");

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 font-mono text-xs overflow-hidden">
      <ToolCardHeader
        icon={<FilePlus size={14} />}
        title="write_file"
        subtitle={fileName || filePath}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        status={streaming ? "running" : isError ? "error" : "done"}
      />
      {isOpen && (
        <div className="border-t border-gray-200 bg-white">
          {!toolResult && content && (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full">
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="bg-green-50 hover:bg-green-100">
                      <td className="select-none px-2 py-0 text-right text-gray-400 border-r border-gray-100 w-10">
                        {i + 1}
                      </td>
                      <td className="px-3 py-0 whitespace-pre text-green-800">+ {line}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {toolResult && (
            <div className={`px-3 py-2 ${isError ? "text-red-600" : "text-green-700"}`}>
              {isError ? result : "File written successfully"}
            </div>
          )}
          {streaming && !content && (
            <div className="px-3 py-2 text-gray-400 italic">Writing...</div>
          )}
        </div>
      )}
    </div>
  );
}
