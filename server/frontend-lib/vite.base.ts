import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const vitePort = parseInt(process.env.FRONTEND_PORT ?? "3000");
const e2bSandboxId = process.env.E2B_SANDBOX_ID;
const e2bDomain = process.env.E2B_DOMAIN;

// JSONL file logger for frontend logs (configurable path, works locally and in containers)
const LOG_DIR = process.env.LOG_DIR ?? path.join(process.cwd(), "logs");
const ALERTS_DIR = process.env.ALERTS_DIR ?? path.join(process.cwd(), "alerts");
const FRONTEND_LOG_FILE = path.join(LOG_DIR, "frontend.jsonl");

const writeLog = (level: string, msg: string) => {
  const entry = JSON.stringify({
    "@timestamp": new Date().toISOString(),
    level,
    message: msg.replace(/\x1b\[[0-9;]*m/g, ""), // Strip ANSI codes
    logger: "frontend.vite",
  });
  fsp.appendFile(FRONTEND_LOG_FILE, entry + "\n").catch(() => {
    // Ignore write errors
  });
};

// Alert digest for frontend errors/warnings
const ALERTS_FILE = path.join(ALERTS_DIR, "frontend.json");
const MAX_ENTRIES = 30;

let errors: { ts: string; msg: string }[] = [];
let warnings: { ts: string; msg: string }[] = [];
try {
  const existing = JSON.parse(fs.readFileSync(ALERTS_FILE, "utf-8"));
  errors = existing.errors ?? [];
  warnings = existing.warnings ?? [];
} catch {
  // File missing or malformed — start fresh
}

const updateAlerts = (level: "error" | "warning", msg: string) => {
  const entry = { ts: new Date().toISOString(), msg: msg.replace(/\x1b\[[0-9;]*m/g, "") };
  const queue = level === "error" ? errors : warnings;
  queue.push(entry);
  if (queue.length > MAX_ENTRIES) queue.shift();

  fsp.writeFile(ALERTS_FILE, JSON.stringify({
    updated_at: new Date().toISOString(),
    errors: [...errors],
    warnings: [...warnings],
  }, null, 2)).catch(() => {
    // Ignore write errors
  });
};

const customLogger = {
  info: (msg: string) => { console.log(msg); writeLog("INFO", msg); },
  warn: (msg: string) => { console.warn(msg); writeLog("WARN", msg); updateAlerts("warning", msg); },
  error: (msg: string) => { console.error(msg); writeLog("ERROR", msg); updateAlerts("error", msg); },
  warnOnce: (msg: string) => { console.warn(msg); writeLog("WARN", msg); updateAlerts("warning", msg); },
  clearScreen: () => {},
  hasErrorLogged: () => false,
  hasWarned: false,
};

/** Vite plugin that captures browser runtime errors and routes them through our logging pipeline */
function browserErrorReporter() {
  return {
    name: "browser-error-reporter",

    // Inject client-side error catcher into the page
    transformIndexHtml() {
      return [{
        tag: "script",
        attrs: { type: "module" },
        children: `
          window.onerror = (message, source, lineno, colno, error) => {
            const loc = source ? \` at \${source}:\${lineno}:\${colno}\` : "";
            fetch("/__browser_error", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: message + loc, stack: error?.stack }),
            }).catch(() => {});
          };
          window.addEventListener("unhandledrejection", (event) => {
            const reason = event.reason;
            const message = reason?.message || String(reason);
            fetch("/__browser_error", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message, stack: reason?.stack }),
            }).catch(() => {});
          });
        `,
        injectTo: "head-prepend",
      }];
    },

    // Server middleware to receive and log browser errors
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use("/__browser_error", (req: any, res: any) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }
        let body = "";
        req.on("data", (chunk: string) => { body += chunk; });
        req.on("end", () => {
          try {
            const { message, stack } = JSON.parse(body);
            const formatted = stack
              ? `[Browser] ${message}\n${stack}`
              : `[Browser] ${message}`;
            customLogger.error(formatted);
          } catch {
            // Ignore malformed requests
          }
          res.end("ok");
        });
      });
    },
  };
}

// HMR config: use E2B host if running in sandbox, otherwise standard localhost
const hmrConfig = e2bSandboxId && e2bDomain
  ? { host: `${vitePort}-${e2bSandboxId}.${e2bDomain}`, clientPort: 443, protocol: "wss" as const }
  : {};

export default defineConfig({
  customLogger,
  plugins: [react(), browserErrorReporter()],
  resolve: {
    alias: {
      "ag0-core": __dirname,
    },
    dedupe: ["react", "react-dom", "zustand", "rxjs"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom/client",
      "zustand",
      "rxjs",
      "rxjs-for-await",
      "swr",
      "streamdown",
    ],
  },
  server: {
    port: vitePort,
    strictPort: true,
    allowedHosts: true,
    hmr: hmrConfig,
  },
});
