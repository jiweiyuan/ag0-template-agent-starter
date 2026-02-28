import { useState, useMemo } from "react";
import type { ToolResultBlock } from "@zypher/ui";

// ============================================================================
// Tool Card Component
// ============================================================================

interface ToolCardProps {
  name: string;
  input: unknown;
  result?: ToolResultBlock;
}

export function ToolCard({ name, input, result }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isComplete = !!result;
  const isError = result && !result.success;

  const inlineArg = useMemo(() => {
    if (!input || typeof input !== "object") return "";
    const obj = input as Record<string, unknown>;
    for (const key of ["file_path", "path", "command", "cmd", "query", "pattern"]) {
      if (obj[key] && typeof obj[key] === "string") {
        const val = obj[key] as string;
        return val.length > 40 ? val.slice(0, 37) + "..." : val;
      }
    }
    return "";
  }, [input]);

  const resultText = useMemo(() => {
    if (!result?.content) return "";
    return result.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n");
  }, [result]);

  return (
    <div className="my-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border
          ${isError ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}
          hover:bg-gray-100 transition-colors`}
      >
        {!isComplete && (
          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        )}
        <span className={isError ? "text-red-600" : "text-gray-700"}>{name}</span>
        {inlineArg && (
          <code className="text-gray-400 font-mono text-[10px] max-w-[200px] truncate">
            {inlineArg}
          </code>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden text-xs">
          {input != null && (
            <div>
              <div className="px-2 py-1 bg-gray-50 text-gray-500 font-medium">Input</div>
              <pre className="p-2 overflow-auto max-h-32 bg-white">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {isComplete && (
            <div className={input ? "border-t border-gray-200" : ""}>
              <div className="px-2 py-1 bg-gray-50 text-gray-500 font-medium">
                Result {isError && <span className="text-red-500">(Error)</span>}
              </div>
              <pre className="p-2 overflow-auto max-h-40 bg-white whitespace-pre-wrap">
                {resultText || "(empty)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Streaming Tool Card
// ============================================================================

interface StreamingToolCardProps {
  name: string;
  partialInput: string;
}

export function StreamingToolCard({ name, partialInput }: StreamingToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100"
      >
        <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-700">{name}</span>
        {partialInput && (
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {isExpanded && partialInput && (
        <div className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden text-xs">
          <div className="px-2 py-1 bg-gray-50 text-gray-500 font-medium">Input</div>
          <pre className="p-2 overflow-auto max-h-32 bg-white">{partialInput}</pre>
        </div>
      )}
    </div>
  );
}
