import {
  configure,
  dispose,
  getConsoleSink,
  getLogger,
  jsonLinesFormatter,
} from "@logtape/logtape";
import { getFileSink } from "@logtape/file";
import { join } from "@std/path";
import { alertTrackerSink } from "./alert-tracker.ts";

const LOG_DIR = "/workspace/logs";
const AGENT_LOG_FILE = join(LOG_DIR, "agent.jsonl");

export async function setupLogging(): Promise<void> {
  await configure({
    sinks: {
      console: getConsoleSink(),
      file: getFileSink(AGENT_LOG_FILE, { formatter: jsonLinesFormatter }),
      alerts: alertTrackerSink,
    },
    loggers: [
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: ["console"],
      },
      {
        category: ["agent"],
        sinks: ["console", "file", "alerts"],
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
