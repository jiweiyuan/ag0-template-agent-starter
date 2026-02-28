/**
 * Pending Message Persistence
 *
 * Used for cancel-to-edit functionality after page refresh.
 * Uses sessionStorage (per-tab, survives refresh) to track messages
 * that are currently being processed by the agent.
 */

const PENDING_MESSAGE_KEY_PREFIX = "pending_message_";

export interface PendingMessage {
  id: string;
  text: string;
}

export function savePendingMessage(chatId: string, message: PendingMessage): void {
  sessionStorage.setItem(
    `${PENDING_MESSAGE_KEY_PREFIX}${chatId}`,
    JSON.stringify(message),
  );
}

export function getPendingMessage(chatId: string): PendingMessage | null {
  const data = sessionStorage.getItem(`${PENDING_MESSAGE_KEY_PREFIX}${chatId}`);
  if (!data) return null;
  try {
    return JSON.parse(data) as PendingMessage;
  } catch {
    return null;
  }
}

export function clearPendingMessage(chatId: string): void {
  sessionStorage.removeItem(`${PENDING_MESSAGE_KEY_PREFIX}${chatId}`);
}
