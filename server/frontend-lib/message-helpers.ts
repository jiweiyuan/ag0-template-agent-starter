import type { ToolResultBlock } from "@zypher/agent";
import type { CompleteMessage } from "ag0-core/store";

/**
 * Build maps for tool use/result matching
 */
export function buildToolMaps(messages: CompleteMessage[]) {
  const toolResultMap = new Map<string, ToolResultBlock>();
  const toolUseIdSet = new Set<string>();

  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === "tool_result") {
        toolResultMap.set(block.toolUseId, block);
      } else if (block.type === "tool_use") {
        toolUseIdSet.add(block.toolUseId);
      }
    }
  }

  return { toolResultMap, toolUseIdSet };
}

/**
 * Check if a message has visible content (filters out orphan tool results)
 */
export function hasVisibleContent(msg: CompleteMessage, toolUseIdSet: Set<string>): boolean {
  return msg.content.some((block) => {
    if (block.type === "tool_result") {
      return !toolUseIdSet.has(block.toolUseId);
    }
    return true;
  });
}

export interface MessageGroup {
  id: string;
  role: "user" | "assistant";
  messages: CompleteMessage[];
}

/**
 * Group consecutive messages by role for cleaner UI
 */
export function groupConsecutiveMessages(
  messages: CompleteMessage[],
  toolUseIdSet: Set<string>
): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    if (!hasVisibleContent(msg, toolUseIdSet)) continue;

    // Determine effective role (tool_result-only messages display as assistant)
    const hasOnlyToolResult = msg.content.every((b) => b.type === "tool_result");
    const effectiveRole = hasOnlyToolResult ? "assistant" : msg.role;

    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.role === effectiveRole) {
      // Add to existing group
      lastGroup.messages.push(msg);
    } else {
      // Start new group
      groups.push({
        id: msg.id,
        role: effectiveRole,
        messages: [msg],
      });
    }
  }

  return groups;
}
