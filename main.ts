import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/deno";
import { proxy } from "hono/proxy";
import { parsePort } from "@zypher/utils/env";
import { createZypherHandler } from "@zypher/http";
import type { ZypherAgent } from "@zypher/agent";
import { APIError } from "@anthropic-ai/sdk";
import { getAgentInfo } from "./server/config/agent_info.ts";
import {
  loadAgentConfig,
  toMcpServerConfigs,
} from "./server/config/agent_config.ts";
import { initDb } from "./server/db/mod.ts";
import { ChatService } from "./server/services/chat_service.ts";
import { AgentManager } from "./server/services/agent_manager.ts";
import { createChatRoutes } from "./server/routes/chats.ts";
import {
  broadcastSyncEvent,
  isConnectionActive,
  registerSyncConnection,
  unregisterSyncConnection,
} from "./server/services/sync_service.ts";
import {
  flushLogs,
  serverLogger,
  setupLogging,
  syncLogger,
} from "./server/lib/logger.ts";
import { buildBadgeScript } from "./server/lib/badge.ts";

/** Resolve path relative to this file's directory */
const resolve = (path: string) => new URL(path, import.meta.url).pathname;

// Handle intentional task cancellation gracefully
// WebSocket errors escape Hono's error boundary, so we catch them globally
globalThis.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.message === "Request was aborted.") {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  serverLogger.error(event.reason);
  flushLogs();
});

/**
 * Handle WebSocket errors, specifically checking for 402 Payment Required.
 * Returns a safe error response for billing errors, re-throws all others.
 */
function handleWebSocketError(
  error: unknown,
): { code: number; message: string } {
  if (error instanceof APIError && error.status === 402) {
    return {
      code: 402,
      message: "You've reached your usage limit.",
    };
  }
  throw error;
}

async function main(): Promise<void> {
  await setupLogging();

  const app = new Hono();
  app.onError((err, c) => {
    serverLogger.error("Unhandled route error", err as Error);
    return c.json({ error: "Internal Server Error" }, 500);
  });
  app.use("*", cors());

  // Initialize database (required for chat management)
  const dbPath = Deno.env.get("SQLITE_PATH") ?? "data/chats.db";
  const db = initDb(dbPath);
  const chatService = new ChatService(db);

  // Load userspace agent — errors here are agent code issues, alert Agent0
  const configPath = resolve("./userspace/agent/agent.json");
  const mod = await import("./userspace/agent/mod.ts");
  const userAgent = mod.userAgent;
  const createAgent = mod.createAgent;

  const agentConfig = await loadAgentConfig(configPath);

  const mcpConfigs = toMcpServerConfigs(agentConfig);

  const registerMcpServers = (agent: ZypherAgent) => {
    for (const server of mcpConfigs.direct) {
      agent.mcp.registerServer(server);
    }
    for (const server of mcpConfigs.registry) {
      agent.mcp.registerServerFromRegistry(server.registry).catch((err) => {
        serverLogger.error("Failed to register {id}: {error}", {
          id: server.id,
          error: err as Error,
        });
      });
    }
  };

  registerMcpServers(userAgent);

  // Initialize agent manager for chat-specific agents
  const agentManager = new AgentManager(
    chatService,
    createAgent,
    registerMcpServers,
    handleWebSocketError,
  );

  // ==========================================================================
  // Routes
  // ==========================================================================

  // Sync WebSocket - real-time chat list updates
  // Uses Deno.upgradeWebSocket directly to support Sec-WebSocket-Protocol negotiation
  app.get("/user-agent/sync/ws", (c) => {
    // Extract session ID from Sec-WebSocket-Protocol header
    // Format: "ws-session-<sessionId>"
    const protocolHeader = c.req.header("Sec-WebSocket-Protocol") ?? "";
    const protocols = protocolHeader.split(",").map((p) => p.trim());
    const sessionProtocol = protocols.find((p) => p.startsWith("ws-session-"));
    const sessionId = sessionProtocol?.replace("ws-session-", "");

    if (!sessionId) {
      return c.json({ error: "missing_session_protocol" }, 400);
    }

    // Use Deno's native WebSocket upgrade with protocol echo
    const { response, socket } = Deno.upgradeWebSocket(c.req.raw, {
      protocol: sessionProtocol,
    });

    // Store connectionId for cleanup on close
    let connectionId: string | null = null;

    socket.onopen = () => {
      connectionId = registerSyncConnection(sessionId, socket);
      // Send connectionId to frontend so it can exclude itself from broadcasts
      socket.send(JSON.stringify({ type: "connected", connectionId }));
      syncLogger.info`Session ${sessionId.slice(0, 8)}... connected`;
    };

    socket.onclose = () => {
      if (connectionId) {
        unregisterSyncConnection(sessionId, connectionId);
      }
      syncLogger.info`Session ${sessionId.slice(0, 8)}... disconnected`;
    };

    socket.onerror = (e: Event) => {
      if (e instanceof ErrorEvent && e.error instanceof Error) {
        syncLogger.error("WebSocket error", e.error);
      } else {
        const msg = e instanceof ErrorEvent ? e.message : "unknown";
        syncLogger.error`WebSocket error: ${msg}`;
      }
    };

    return response;
  });

  // Runtime info endpoint - returns agent config from live instance + agent.json metadata
  app.get("/user-agent/info", async (c) => {
    const info = await getAgentInfo(userAgent, configPath);
    return c.json(info);
  });

  // Skill reload endpoint - re-discovers skills from disk
  app.post("/user-agent/skills/reload", async (c) => {
    serverLogger.info("Reloading skills...");
    await userAgent.skills.discover();
    const skills = userAgent.skills.skills;
    serverLogger.info`Skills reloaded: ${skills.map((s) => s.metadata.name)}`;
    return c.json({
      success: true,
      skills: skills.map((s) => s.metadata.name),
    });
  });

  // Health check endpoint (lightweight, fast)
  app.get("/health", (c) => c.json({ status: "ok" }));

  // MCP Store endpoint - browse available MCP servers from CoreSpeed registry
  app.get("/user-agent/mcp/store/servers", async (c) => {
    const limit = parseInt(c.req.query("limit") ?? "50");
    const servers = await userAgent.mcp.listRegistryServers({ limit });
    return c.json({
      count: servers.length,
      data: servers,
    });
  });

  // Chat-specific agent routes - handles both REST and WebSocket
  // MUST be registered before chat management routes to take precedence
  // e.g., /user-agent/chats/:chatId/agent/task/ws for WebSocket
  app.all("/user-agent/chats/:chatId/agent/*", async (c) => {
    const chatId = c.req.param("chatId");

    // Clean up any agents that were marked for destruction and are now idle
    agentManager.cleanupPendingAgents();

    // Get session ID and excludeMessageId from header (REST) or Sec-WebSocket-Protocol (WebSocket)
    // WebSocket protocol format: "zypher.v1, ws-session-xxx, ws-exclude-xxx"
    let sessionId = c.req.header("X-Session-ID");
    let excludeMessageId: string | undefined;

    const wsProtocol = c.req.header("Sec-WebSocket-Protocol") ?? "";
    if (wsProtocol) {
      const protocols = wsProtocol.split(",").map((p) => p.trim());

      if (!sessionId) {
        const sessionProtocol = protocols.find((p) =>
          p.startsWith("ws-session-")
        );
        sessionId = sessionProtocol?.replace("ws-session-", "");
      }

      const excludeProtocol = protocols.find((p) =>
        p.startsWith("ws-exclude-")
      );
      excludeMessageId = excludeProtocol?.replace("ws-exclude-", "");
    }

    if (!sessionId) {
      return c.json({ error: "missing_session_id" }, 400);
    }

    // Verify chat exists and belongs to session
    const chat = chatService.getChat(chatId, sessionId);
    if (!chat) {
      return c.json({ error: "chat_not_found" }, 404);
    }

    // Get or create agent and handler for this chat
    const { handler } = await agentManager.getOrCreateAgent(
      chatId,
      sessionId,
      excludeMessageId,
    );

    return handler.fetch(c.req.raw);
  });

  // Chat management routes (must be before generic handler)
  app.route(
    "/user-agent/chats",
    createChatRoutes({
      chatService,
      onDestroyAgent: (chatId) => agentManager.destroyAgent(chatId),
      onMarkPendingDestruction: (chatId) =>
        agentManager.markForPendingDestruction(chatId),
      onCancelPendingDestruction: (chatId) =>
        agentManager.cancelPendingDestruction(chatId),
      onTaskStarted: (chatId, connectionId) =>
        agentManager.registerTaskHandler(chatId, connectionId),
      onTaskEnded: (chatId) => agentManager.unregisterTaskHandler(chatId),
    }),
  );

  // Cancel task for a specific chat (used by other tabs to cancel a running task)
  // Broadcasts a cancel request via sync WebSocket - the tab running the task will handle it
  app.post("/user-agent/chats/:chatId/cancel", (c) => {
    const chatId = c.req.param("chatId");
    const sessionId = c.req.header("X-Session-ID");
    const connectionId = c.req.header("X-Connection-ID");
    if (!sessionId) {
      return c.json({ error: "missing_session_id" }, 400);
    }

    // Verify chat exists and belongs to session
    const chat = chatService.getChat(chatId, sessionId);
    if (!chat) {
      return c.json({ error: "chat_not_found" }, 404);
    }

    // Check if there's actually a running task
    const entry = agentManager.getAgent(chatId);
    const isTaskRunning = entry?.agent.isTaskRunning ?? false;

    if (isTaskRunning) {
      // Task is running - broadcast cancel request to the tab that owns it
      broadcastSyncEvent(
        sessionId,
        { type: "task_cancel_requested", chatId },
        connectionId,
      );
      return c.json({ success: true, action: "cancel_requested" });
    } else {
      // No task running (tab may have closed) - broadcast task_ended to clean up stale UI
      broadcastSyncEvent(
        sessionId,
        { type: "task_ended", chatId },
        connectionId,
      );
      return c.json({ success: true, action: "task_ended" });
    }
  });

  // List active chat agents and their task status
  // Used by frontend to check for running tasks on page load
  app.get("/user-agent/agents/active", (c) => {
    const sessionId = c.req.header("X-Session-ID");

    // Clean up any agents that were marked for destruction and are now idle
    agentManager.cleanupPendingAgents();

    const activeAgents = agentManager.getActiveAgents().map((agent) => ({
      ...agent,
      isHandlerConnected: agent.handlerConnectionId && sessionId
        ? isConnectionActive(sessionId, agent.handlerConnectionId)
        : false,
    }));

    return c.json({ agents: activeAgents });
  });

  // Default agent handler for backward compatibility (no chat context)
  app.route(
    "/user-agent",
    createZypherHandler({
      agent: userAgent,
      websocket: { onError: handleWebSocketError },
    }),
  );

  // Serve frontend - either static files (production) or proxy to Vite (development)
  // Mode is determined by ENV environment variable (default: production)
  const isDev = Deno.env.get("ENV") === "development";

  if (isDev) {
    // Development: proxy to Vite dev server on localhost
    const vitePort = Deno.env.get("FRONTEND_PORT") || "3000";
    app.all("/*", (c) => {
      const incomingUrl = new URL(c.req.url);
      const proxyUrl =
        `http://localhost:${vitePort}${incomingUrl.pathname}${incomingUrl.search}`;
      return proxy(proxyUrl, c.req.raw);
    });
  } else {
    // Production (default): serve static files from dist/
    // Use absolute path resolved from main.ts location
    const distPath = resolve("./userspace/frontend/dist");
    const indexPath = `${distPath}/index.html`;
    let indexHtml = await Deno.readTextFile(indexPath);

    // Inject badge into index.html on disk so serveStatic serves it too
    if (Deno.env.get("SHOW_BADGE") === "true") {
      const badgeTag = `<script>${buildBadgeScript()}</script>`;
      indexHtml = indexHtml.replace("</body>", badgeTag + "\n</body>");
      await Deno.writeTextFile(indexPath, indexHtml);
    }

    app.use("/*", serveStatic({ root: distPath }));
    app.get("*", (c) => c.html(indexHtml));
  }

  const port = parsePort(Deno.env.get("PORT"), 8080);
  serverLogger.info`Starting server on port ${port}`;

  const server = Deno.serve({
    handler: app.fetch,
    port,
  });
  await server.finished;
}

if (import.meta.main) {
  main();
}
