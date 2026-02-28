/**
 * Agent configuration schema and parsing utilities.
 *
 * Defines the structure of agent.json configuration files and provides
 * functions to parse and load them with validation.
 *
 * @module
 */
import { z } from "zod";

/** Schema for command-based MCP server (spawns a local process) */
const CommandMcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

/** Schema for remote MCP server (connects via HTTP) */
const RemoteMcpServerSchema = z.object({
  url: z.string(),
});

/** Schema for registry-based MCP server (resolved from CoreSpeed MCP Store) */
const RegistryMcpServerSchema = z.object({
  registry: z.string(),
});

/** Schema for MCP server config - command, remote, or registry */
const McpServerConfigSchema = z.union([
  CommandMcpServerSchema,
  RemoteMcpServerSchema,
  RegistryMcpServerSchema,
]);

/**
 * Schema for the agent.json configuration file.
 *
 * @example
 * ```json
 * {
 *   "name": "My Agent",
 *   "description": "A helpful assistant",
 *   "mcpServers": {
 *     "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"] },
 *     "remote-api": { "url": "https://api.example.com/mcp" }
 *   }
 * }
 * ```
 */
export const AgentConfigSchema = z.object({
  name: z.string().default("User Agent"),
  description: z.string().default(""),
  mcpServers: z.record(z.string(), McpServerConfigSchema).default({}),
});

/** Inferred type from AgentConfigSchema */
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Parse and validate agent config from a JSON string.
 * @param json - Raw JSON string to parse
 * @returns Validated AgentConfig object
 * @throws {z.ZodError} If validation fails
 */
export function parseAgentConfig(json: string): AgentConfig {
  return AgentConfigSchema.parse(JSON.parse(json));
}

/**
 * Load and parse agent config from a file.
 * Returns default config if file doesn't exist.
 * @param path - Path to the config file (defaults to ./userspace/agent/agent.json)
 * @returns Validated AgentConfig object
 * @throws {z.ZodError} If validation fails
 */
export async function loadAgentConfig(
  path = "./userspace/agent/agent.json",
): Promise<AgentConfig> {
  try {
    const json = await Deno.readTextFile(path);
    return parseAgentConfig(json);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return AgentConfigSchema.parse({});
    }
    throw e;
  }
}

/** Direct MCP server config (command or remote) */
export type DirectMcpServerConfig =
  | { id: string; type: "remote"; remote: { url: string } }
  | {
    id: string;
    type: "command";
    command: { command: string; args?: string[]; env?: Record<string, string> };
  };

/** Registry MCP server config (resolved from CoreSpeed MCP Store) */
export type RegistryMcpServerConfig = {
  id: string;
  registry: string;
};

/**
 * Convert AgentConfig mcpServers to ZypherAgent mcpServers format.
 * Separates direct servers (command/remote) from registry servers.
 * @param config - The agent configuration
 * @returns Object with direct configs and registry configs
 */
export function toMcpServerConfigs(config: AgentConfig): {
  direct: DirectMcpServerConfig[];
  registry: RegistryMcpServerConfig[];
} {
  const direct: DirectMcpServerConfig[] = [];
  const registry: RegistryMcpServerConfig[] = [];

  for (const [id, server] of Object.entries(config.mcpServers)) {
    if ("registry" in server) {
      registry.push({ id, registry: server.registry });
    } else if ("url" in server) {
      direct.push({
        id,
        type: "remote" as const,
        remote: { url: server.url },
      });
    } else {
      direct.push({
        id,
        type: "command" as const,
        command: {
          command: server.command,
          args: server.args,
          env: server.env,
        },
      });
    }
  }

  return { direct, registry };
}
