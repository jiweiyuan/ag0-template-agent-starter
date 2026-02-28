import { BashCard } from "./BashCard";
import { ReadCard } from "./ReadCard";
import { WriteCard } from "./WriteCard";
import { EditCard } from "./EditCard";
import { GlobCard } from "./GlobCard";
import { GrepCard } from "./GrepCard";
import { DefaultCard } from "./DefaultCard";
import { getToolType, type ToolUseBlock, type ToolResultBlock } from "./types";

interface ToolCardProps {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  streaming?: boolean;
}

export function ToolCard({ toolUse, toolResult, streaming }: ToolCardProps) {
  const type = getToolType(toolUse.name);
  const props = { toolUse, toolResult, streaming };

  switch (type) {
    case "bash": return <BashCard {...props} />;
    case "read_file": return <ReadCard {...props} />;
    case "write_file": return <WriteCard {...props} />;
    case "edit_file": return <EditCard {...props} />;
    case "glob": return <GlobCard {...props} />;
    case "grep": return <GrepCard {...props} />;
    default: return <DefaultCard {...props} />;
  }
}

export function StreamingToolCard({ name, partialInput }: { name: string; partialInput: string }) {
  const fakeToolUse: ToolUseBlock = {
    type: "tool_use",
    toolUseId: "streaming",
    name,
    input: (() => {
      try { return JSON.parse(partialInput || "{}"); } catch { return {}; }
    })(),
  };
  return <ToolCard toolUse={fakeToolUse} streaming />;
}
