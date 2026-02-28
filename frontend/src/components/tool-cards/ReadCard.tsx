import { useState } from "react";
import { FileText } from "lucide-react";
import { ToolCardHeader } from "./ToolCardHeader";
import { extractFilePath, extractResultText, getFileNameFromPath } from "./utils";
import type { BaseToolCardProps } from "./types";

export function ReadCard({ toolUse, toolResult, streaming }: BaseToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filePath = extractFilePath(toolUse.input);
  const fileName = getFileNameFromPath(filePath);
  const content = toolResult ? extractResultText(toolResult) : "";
  const isError = toolResult?.isError ?? false;
  const lines = content.split("\n");

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 font-mono text-xs overflow-hidden">
      <ToolCardHeader
        icon={<FileText size={14} />}
        title="read_file"
        subtitle={fileName || filePath}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        status={streaming ? "running" : isError ? "error" : "done"}
      />
      {isOpen && content && (
        <div className="border-t border-gray-200 max-h-64 overflow-y-auto bg-white">
          {isError ? (
            <div className="px-3 py-2 text-red-600">{content}</div>
          ) : (
            <table className="w-full">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="select-none px-2 py-0 text-right text-gray-400 border-r border-gray-100 w-10 shrink-0">
                      {i + 1}
                    </td>
                    <td className="px-3 py-0 whitespace-pre text-gray-800">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {isOpen && !content && streaming && (
        <div className="border-t border-gray-200 px-3 py-2 text-gray-400 italic bg-white">Reading...</div>
      )}
    </div>
  );
}
