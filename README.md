# ag0-template-agent-starter

A full-stack AI agent starter template extracted from the [Agent0](https://github.com/yuanjiwei/agent0) platform.

## Stack

- **Backend**: Deno + Hono + [@zypher/agent](https://jsr.io/@zypher/agent) SDK
- **Frontend**: React 19 + Vite + Tailwind CSS + Zustand
- **Database**: SQLite (via `@db/sqlite`)
- **AI**: Anthropic Claude (direct API key or CoreSpeed gateway)

## Project Structure

```
ag0-template-agent-starter/
├── main.ts                    # Backend entry point (Deno + Hono)
├── deno.json                  # Deno workspace config
├── Dockerfile                 # Production Docker build
├── server/                    # Backend infrastructure (do not modify)
│   ├── config/                # Model + agent config
│   ├── db/                    # SQLite chat storage (Drizzle ORM)
│   ├── routes/                # REST API routes
│   ├── services/              # Agent manager, chat service, sync
│   ├── lib/                   # Logger, utilities
│   └── frontend-lib/          # Shared types + Vite base config
└── userspace/                 # Your workspace — customize here
    ├── agent/
    │   ├── mod.ts             # Agent definition (main file to edit)
    │   ├── agent.json         # MCP server config
    │   └── tools/             # Custom tool implementations
    └── frontend/              # React chat UI
        ├── src/
        │   ├── App.tsx        # Main chat component
        │   └── components/    # Sidebar, ChatHeader, ToolCard, etc.
        └── package.json
```

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) 2.6+
- [Bun](https://bun.sh/) (for frontend)
- Anthropic API key

### Setup

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY

# 2. Install frontend dependencies
cd userspace/frontend && bun install && cd ../..

# 3. Start development (two terminals)
deno run -A --watch=./userspace/agent/ main.ts   # Terminal 1: backend (port 8080)
cd userspace/frontend && bun dev                  # Terminal 2: frontend (port 3000)
```

Open [http://localhost:3000](http://localhost:3000) to chat with your agent.

## Customizing the Agent

Edit `userspace/agent/mod.ts`:

```typescript
import { createZypherAgent, type Message } from "@zypher/agent";
import { createModel } from "ag0-server/config/model.ts";
import { RunTerminalCmdTool } from "@zypher/agent/tools";
// import { MyCustomTool } from "./tools/my_tool.ts";

export async function createAgent(initialMessages?: Message[]) {
  return await createZypherAgent({
    workingDirectory: "./",
    model: createModel("claude-sonnet-4-5-20250929"),
    initialMessages,
    tools: [
      RunTerminalCmdTool,
      // MyCustomTool,
    ],
  });
}

export const userAgent = await createAgent();
```

### Adding Custom Tools

Create a file in `userspace/agent/tools/` and import it in `mod.ts`:

```typescript
// userspace/agent/tools/weather.ts
import { defineTool } from "@zypher/agent";
import { z } from "zod";

export const GetWeatherTool = defineTool({
  name: "get_weather",
  description: "Get current weather for a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    // Your implementation
    return `Weather in ${city}: sunny, 72°F`;
  },
});
```

### Adding MCP Servers

Edit `userspace/agent/agent.json`:

```json
{
  "name": "My Agent",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "remote-server": {
      "url": "https://example.com/mcp"
    }
  }
}
```

## Production (Docker)

```bash
docker build -t my-agent .
docker run -p 8080:8080 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  my-agent
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Direct Anthropic API key |
| `CORESPEED_USER_ID` | Yes* | CoreSpeed gateway ID (alternative) |
| `PORT` | No | Server port (default: `8080`) |
| `ENV` | No | `development` enables Vite dev proxy |
| `FRONTEND_PORT` | No | Vite dev server port (default: `3000`) |
| `SQLITE_PATH` | No | Database path (default: `data/chats.db`) |

*One of `ANTHROPIC_API_KEY` or `CORESPEED_USER_ID` is required.

## How It Works

```
User → React frontend (Vite)
         ↓ WebSocket
      Deno backend (Hono)
         ↓
      @zypher/agent SDK
         ↓
      Anthropic Claude
         ↓ tools
      Your custom tools / MCP servers
```

- **Chat management**: SQLite stores chat sessions and message history
- **Multi-tab sync**: WebSocket sync keeps chat list updated across browser tabs
- **Streaming**: Real-time token streaming via `@zypher/agent` task API
- **Tool cards**: Frontend renders rich tool call visualizations
