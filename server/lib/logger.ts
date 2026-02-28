import {
  configure,
  dispose,
  getConsoleSink,
  getLogger,
  jsonLinesFormatter,
} from "@logtape/logtape";
import { getFileSink } from "@logtape/file";
import { join } from "@std/path";

const LOG_DIR = Deno.env.get("LOG_DIR") ?? "logs";
const AGENT_LOG_FILE = join(LOG_DIR, "agent.jsonl");

export async function setupLogging(): Promise<void> {
  // Ensure log directory exists
  await Deno.mkdir(LOG_DIR, { recursive: true }).catch(() => {});

  await configure({
    sinks: {
      console: getConsoleSink(),
      file: getFileSink(AGENT_LOG_FILE, { formatter: jsonLinesFormatter }),
    },
    loggers: [
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: ["console"],
      },
      {
        category: ["agent"],
        sinks: ["console", "file"],
        lowestLevel: "debug",
      },
    ],
  });
}

/** Flush all sinks and tear down logtape — call before a known process exit */
export async function flushLogs(): Promise<void> {
  await dispose();
}

// Pre-defined loggers
export const serverLogger = getLogger(["agent", "server"]);
export const syncLogger = getLogger(["agent", "sync"]);
export const dbLogger = getLogger(["agent", "db"]);
export const chatsLogger = getLogger(["agent", "chats"]);
