export interface ToolUseBlock {
  type: "tool_use";
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  isError?: boolean;
}

export interface BaseToolCardProps {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  streaming?: boolean;
}

export type ToolType =
  | "bash"
  | "read_file"
  | "write_file"
  | "edit_file"
  | "glob"
  | "grep"
  | "web_search"
  | "web_fetch"
  | "default";

export function getToolType(name: string): ToolType {
  const n = name.toLowerCase();
  if (n === "bash" || n === "shell" || n === "exec" || n === "run_terminal_cmd") return "bash";
  if (n === "read_file" || n === "read") return "read_file";
  if (n === "write_file" || n === "write") return "write_file";
  if (n === "edit_file" || n === "edit" || n === "str_replace_editor") return "edit_file";
  if (n === "glob" || n === "file_search" || n === "list_file" || n === "list_dir") return "glob";
  if (n === "grep" || n === "grep_search" || n === "search") return "grep";
  if (n === "web_search") return "web_search";
  if (n === "web_fetch" || n === "fetch") return "web_fetch";
  return "default";
}
