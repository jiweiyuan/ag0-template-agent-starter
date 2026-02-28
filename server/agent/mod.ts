import { createZypherAgent, type Message } from "@zypher/agent";
import { createModel } from "ag0-server/config/model.ts";

// =============================================================================
// TOOL IMPORTS
// =============================================================================
// Custom tools: Define your own tools in tools/ and import them here
// import { GetWeatherTool } from "./tools/weather.ts";

// Built-in tools: Zypher provides common tools for file system and terminal access
// - createFileSystemTools(): Returns tools for read_file, list_dir, edit_file,
//   undo_file, grep_search, file_search, copy_file, delete_file
// - RunTerminalCmdTool: Execute shell commands
// import { createFileSystemTools, RunTerminalCmdTool } from "@zypher/agent/tools";
import { RunTerminalCmdTool } from "@zypher/agent/tools";

/**
 * Creates a new agent instance with optional initial messages.
 * Used to create chat-specific agents with restored conversation context.
 */
export async function createAgent(initialMessages?: Message[]) {
  return await createZypherAgent({
    // Base directory for file operations (e.g., ReadTool, WriteTool)
    workingDirectory: "./",

    // Model provider - uses centralized config from server/config/model.ts
    // Change the model ID to use a different model (e.g., "claude-3-5-haiku-latest")
    model: createModel("anthropic/claude-sonnet-4-5-20250929"),

    // Initial messages to restore conversation context
    initialMessages,

    // Agent configuration
    config: {
      // Skills: symlink /playground/.skills → /workspace/userspace/agent/skills
      skills: {
        projectSkillsDir: ".skills",
      },
    },

    // Override default behaviors with custom implementations
    // overrides: {
    //   // Custom system prompt loader - called before each task
    //   // Returns the system prompt that defines the agent's behavior and persona
    //   // Note: Returning different prompts each time will break prompt caching
    //   systemPromptLoader: async () => {
    //     return await Deno.readTextFile("./system-prompt.txt");
    //   },
    // },

    // Tools give the agent capabilities to perform actions
    // You can use built-in tools, or define custom tools in tools/
    tools: [
      // Example: Custom tool defined in tools/weather.ts
      // GetWeatherTool,

      // Example: Built-in file system tools
      // ...createFileSystemTools(),

      // Built-in terminal command execution
      RunTerminalCmdTool,
    ],
    // MCP servers are configured in ./agent.json, not here
    // To add MCP servers, edit agent.json:
    // {
    //   "mcpServers": {
    //     "server-id": { "command": "npx", "args": ["-y", "@package/name"] },
    //     "remote-server": { "url": "https://example.com/mcp" }
    //   }
    // }
  });
}

// Default agent for backward compatibility
const userAgent = await createAgent();

export { userAgent };
