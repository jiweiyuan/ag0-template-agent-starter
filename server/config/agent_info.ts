/**
 * Agent runtime information types and utilities.
 *
 * Provides types for representing agent capabilities at runtime and
 * functions to extract this information from a ZypherAgent instance.
 *
 * @module
 */
import type { ZypherAgent } from "@zypher/agent";
import { type AgentConfig, loadAgentConfig } from "./agent_config.ts";

/** Basic tool information */
export interface ToolInfo {
  name: string;
  description: string;
}

/** Base properties for all MCP server info */
interface McpServerInfoBase {
  id: string;
  tools: ToolInfo[];
}

/** Info for a command-based MCP server (local process) */
interface CommandMcpServerInfo extends McpServerInfoBase {
  type: "command";
  command: string;
  args?: string[];
}

/** Info for a remote MCP server (HTTP connection) */
interface RemoteMcpServerInfo extends McpServerInfoBase {
  type: "remote";
  url: string;
}

/** MCP server runtime info - either command-based or remote */
export type McpServerInfo = CommandMcpServerInfo | RemoteMcpServerInfo;

/**
 * Complete runtime information about an agent.
 * Used by the /user-agent/info endpoint.
 */
export interface AgentInfo {
  name: string;
  description: string;
  model: string;
  tools: ToolInfo[];
  mcpServers: McpServerInfo[];
  systemPrompt: string;
}

/**
 * Build AgentInfo from a ZypherAgent instance and config.
 * @param agent - The ZypherAgent instance to extract info from
 * @param config - The agent configuration (name, description, etc.)
 * @returns AgentInfo object with runtime details
 */
export async function buildAgentInfo(
  agent: ZypherAgent,
  config: AgentConfig,
): Promise<AgentInfo> {
  return {
    name: config.name,
    description: config.description,
    model: `${agent.llm.info.name}/${agent.llm.modelId}`,
    tools: Array.from(agent.mcp.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
    })),
    mcpServers: Array.from(agent.mcp.servers.values()).map(
      (s): McpServerInfo => {
        const tools = s.client.tools.map((t) => ({
          name: t.name,
          description: t.description,
        }));

        if (s.server.type === "command") {
          return {
            id: s.server.id,
            type: "command",
            command: s.server.command.command,
            args: s.server.command.args,
            tools,
          };
        }
        return {
          id: s.server.id,
          type: "remote",
          url: s.server.remote.url,
          tools,
        };
      },
    ),
    systemPrompt: await agent.systemPromptLoader(),
  };
}

/**
 * Load config and build AgentInfo from a ZypherAgent instance.
 * Convenience function that combines loadAgentConfig and buildAgentInfo.
 * @param agent - The ZypherAgent instance to extract info from
 * @param configPath - Path to agent.json (defaults to ./userspace/agent/agent.json)
 * @returns AgentInfo object with runtime details
 */
export async function getAgentInfo(
  agent: ZypherAgent,
  configPath?: string,
): Promise<AgentInfo> {
  const config = await loadAgentConfig(configPath);
  return buildAgentInfo(agent, config);
}
