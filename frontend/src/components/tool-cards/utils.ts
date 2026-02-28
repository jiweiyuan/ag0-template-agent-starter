export function extractFilePath(input: Record<string, unknown>): string {
  return (
    (input.file_path as string) ??
    (input.path as string) ??
    (input.filePath as string) ??
    (input.file as string) ??
    (input.filename as string) ??
    ""
  );
}

export function extractResultText(toolResult: { content?: unknown }): string {
  const content = toolResult.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: string; text: string } =>
        typeof b === "object" && b !== null && (b as Record<string, unknown>).type === "text"
      )
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

export function getFileNameFromPath(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

export function getLangFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
    rb: "ruby", php: "php", cs: "csharp", cpp: "cpp", c: "c",
    sh: "bash", zsh: "bash", bash: "bash", json: "json", yaml: "yaml",
    yml: "yaml", toml: "toml", md: "markdown", html: "html", css: "css",
    scss: "scss", sql: "sql", dockerfile: "dockerfile", xml: "xml",
  };
  return map[ext] ?? "text";
}

export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function truncateText(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n… (truncated)";
}

export function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
