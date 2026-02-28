import type { LogRecord, Sink } from "@logtape/logtape";

interface AlertEntry {
  ts: string;
  msg: string;
}

interface AlertDigest {
  updated_at: string;
  errors: AlertEntry[];
  warnings: AlertEntry[];
}

const MAX_ENTRIES = 30;
const ALERTS_FILE = "/workspace/alerts/agent.json";

class AlertTracker {
  private errors: AlertEntry[] = [];
  private warnings: AlertEntry[] = [];

  constructor(private readonly filePath: string) {
    try {
      const content = Deno.readTextFileSync(filePath);
      const digest: AlertDigest = JSON.parse(content);
      this.errors = digest.errors ?? [];
      this.warnings = digest.warnings ?? [];
    } catch {
      // File missing or malformed — start fresh
    }
  }

  addError(ts: string, msg: string): void {
    this.errors.push({ ts, msg });
    if (this.errors.length > MAX_ENTRIES) this.errors.shift();
    this.write();
  }

  addWarning(ts: string, msg: string): void {
    this.warnings.push({ ts, msg });
    if (this.warnings.length > MAX_ENTRIES) this.warnings.shift();
    this.write();
  }

  /** Sync write — must complete before process crashes */
  private write(): void {
    const digest: AlertDigest = {
      updated_at: new Date().toISOString(),
      errors: [...this.errors],
      warnings: [...this.warnings],
    };

    try {
      Deno.writeTextFileSync(
        this.filePath,
        JSON.stringify(digest, null, 2),
      );
    } catch {
      // Ignore write errors
    }
  }
}

const tracker = new AlertTracker(ALERTS_FILE);

function formatMessage(record: LogRecord): string {
  const parts = record.message.map((m) => {
    if (typeof m === "string") return m;
    if (m instanceof Error) return m.stack ?? m.message;
    return JSON.stringify(m);
  });
  // With logtape v2 error overloads (e.g. logger.error("msg", err)),
  // the Error is in properties.error — append its stack trace
  const propError = record.properties?.error;
  if (propError instanceof Error) {
    parts.push("\n", propError.stack ?? propError.message);
  }
  return parts.join("");
}

/** Logtape sink that tracks errors/warnings to alerts/agent.json (sync for crash safety) */
export const alertTrackerSink: Sink = (record: LogRecord) => {
  const msg = formatMessage(record);
  const ts = new Date(record.timestamp).toISOString();

  if (record.level === "error" || record.level === "fatal") {
    tracker.addError(ts, msg);
  } else if (record.level === "warning") {
    tracker.addWarning(ts, msg);
  }
};
