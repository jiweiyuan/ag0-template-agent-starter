import type { SyncEvent } from "../frontend-lib/types.ts";
import { syncLogger as logger } from "../lib/logger.ts";

// Connection entry with unique ID
interface SyncConnection {
  ws: WebSocket;
  connectionId: string;
}

// Map of sessionId -> Map of connectionId -> SyncConnection
const syncConnections = new Map<string, Map<string, SyncConnection>>();

// Counter for generating unique connection IDs
let connectionCounter = 0;

/**
 * Generate a unique connection ID.
 */
function generateConnectionId(): string {
  return `conn_${Date.now()}_${++connectionCounter}`;
}

/**
 * Register a sync WebSocket connection for a session.
 * Returns the unique connection ID for this connection.
 */
export function registerSyncConnection(
  sessionId: string,
  ws: WebSocket,
): string {
  const connectionId = generateConnectionId();

  let connections = syncConnections.get(sessionId);
  if (!connections) {
    connections = new Map();
    syncConnections.set(sessionId, connections);
  }
  connections.set(connectionId, { ws, connectionId });

  const sid = sessionId.slice(0, 8);
  logger
    .info`Registered ${connectionId} for ${sid}..., total: ${connections.size}`;

  return connectionId;
}

/**
 * Unregister a specific sync WebSocket connection when it closes.
 */
export function unregisterSyncConnection(
  sessionId: string,
  connectionId: string,
): void {
  const connections = syncConnections.get(sessionId);
  if (connections) {
    connections.delete(connectionId);
    logger.info`Unregistered ${connectionId}, remaining: ${connections.size}`;
    // Clean up empty maps
    if (connections.size === 0) {
      syncConnections.delete(sessionId);
    }
  }
}

/** WebSocket ready state for OPEN */
const WS_OPEN = 1;

/**
 * Check if a specific connection is still active (connected).
 */
export function isConnectionActive(
  sessionId: string,
  connectionId: string,
): boolean {
  const connections = syncConnections.get(sessionId);
  if (!connections) return false;
  const conn = connections.get(connectionId);
  if (!conn) return false;
  return conn.ws.readyState === WS_OPEN;
}

/**
 * Broadcast a sync event to all connections for a session.
 * Optionally exclude a specific connection (the sender).
 */
export function broadcastSyncEvent(
  sessionId: string,
  event: SyncEvent,
  excludeConnectionId?: string,
): void {
  const connections = syncConnections.get(sessionId);
  if (!connections) {
    logger.info`No connections for ${sessionId.slice(0, 8)}...`;
    return;
  }

  const message = JSON.stringify(event);
  let sent = 0;
  let skipped = 0;
  for (const [connId, { ws }] of connections) {
    // Skip the sender's connection
    if (connId === excludeConnectionId) {
      skipped++;
      continue;
    }
    if (ws.readyState === WS_OPEN) {
      try {
        ws.send(message);
        sent++;
      } catch (err) {
        logger.error("Failed to broadcast event", err as Error);
      }
    }
  }
  const suffix = skipped ? " (skipped sender)" : "";
  logger
    .info`Broadcast ${event.type} to ${sent}/${connections.size} connections${suffix}`;
}
