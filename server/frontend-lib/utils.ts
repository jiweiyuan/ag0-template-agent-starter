/**
 * Shared utility functions for the frontend infrastructure.
 */

export type MessageIdPrefix = "message" | "delta" | "optimistic" | "greeting";

/**
 * Generates a unique message ID with a prefix and timestamp.
 */
export function generateMessageId(prefix: MessageIdPrefix): string {
  return `${prefix}-${Date.now().toString()}${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}
