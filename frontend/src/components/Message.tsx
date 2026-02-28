import type { ContentBlock, ToolResultBlock } from "@zypher/ui";
import { Streamdown } from "streamdown";
import { ToolCard, StreamingToolCard } from "./tool-cards/ToolCard";
import type { ToolUseBlock, ToolResultBlock as LocalToolResultBlock } from "./tool-cards/types";
import type { StreamingMessage } from "ag0-core/store";

interface MessageProps {
  content: ContentBlock[];
  toolResultMap: Map<string, ToolResultBlock>;
  toolUseIdSet: Set<string>;
}

export function Message({ content, toolResultMap, toolUseIdSet }: MessageProps) {
  const rendered: React.ReactNode[] = [];
  const renderedToolResultIds = new Set<string>();

  for (let i = 0; i < content.length; i++) {
    const block = content[i];

    switch (block.type) {
      case "text": {
        rendered.push(
          <div key={i} className="prose prose-sm max-w-none prose-gray">
            <Streamdown controls>{block.text}</Streamdown>
          </div>
        );
        break;
      }
      case "tool_use": {
        const b = block as unknown as ToolUseBlock;
        const toolResult = toolResultMap.get(b.toolUseId);
        if (toolResult) renderedToolResultIds.add(b.toolUseId);
        rendered.push(
          <ToolCard
            key={`tool-${b.toolUseId}`}
            toolUse={b}
            toolResult={toolResult as unknown as LocalToolResultBlock | undefined}
          />
        );
        break;
      }
      case "tool_result": {
        const b = block as unknown as ToolResultBlock & { name?: string; input?: Record<string, unknown> };
        if (renderedToolResultIds.has(b.toolUseId) || toolUseIdSet.has(b.toolUseId)) break;
        rendered.push(
          <ToolCard
            key={`result-${b.toolUseId}`}
            toolUse={{
              type: "tool_use",
              toolUseId: b.toolUseId,
              name: b.name ?? "tool",
              input: (b.input as Record<string, unknown>) ?? {},
            }}
            toolResult={b as unknown as LocalToolResultBlock}
          />
        );
        break;
      }
    }
  }

  return <>{rendered}</>;
}

export function StreamingMessages({ messages }: { messages: StreamingMessage[] }) {
  return (
    <>
      {messages.map((msg) => {
        if (msg.type === "streaming_text") {
          return (
            <div key={msg.id} className="prose prose-sm max-w-none prose-gray">
              <Streamdown controls mode="streaming" isAnimating>{msg.text}</Streamdown>
            </div>
          );
        }
        return (
          <StreamingToolCard
            key={msg.id}
            name={msg.toolUseName}
            partialInput={msg.partialInput}
          />
        );
      })}
    </>
  );
}
