import { ZypherApiClient } from "ag0-core/api";

const STORAGE_KEY = "session_id";

/**
 * Get or create session ID for anonymous users.
 * Session ID is stored in localStorage to persist across page loads.
 */
export function getSessionId(): string {
  let sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Shared API client instance for the application.
 */
export const sessionId = getSessionId();
export const apiClient = new ZypherApiClient({ baseUrl: "/user-agent", sessionId });
