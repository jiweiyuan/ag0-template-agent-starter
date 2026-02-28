import { createZypherAgent } from "@zypher/agent";
import { lastValueFrom } from "rxjs";
import { createModel } from "../config/model.ts";

const TITLE_PROMPT =
  `Generate a short title (3-6 words) for a chat based on the user's message.
Output ONLY the title, no quotes, no punctuation at the end.
Examples:
- "How do I center a div?" -> "CSS Div Centering Help"
- "Write a Python script to download images" -> "Python Image Downloader Script"
- "What's the weather like today?" -> "Weather Inquiry"`;

/**
 * Extract text from content blocks array.
 */
function extractText(
  content: { type: string; text?: string }[],
): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text!)
    .join("\n");
}

/**
 * Generate a chat title from the user's first message using a lightweight agent.
 */
export async function generateChatTitle(
  userMessage: string,
): Promise<string> {
  const agent = await createZypherAgent({
    model: createModel("anthropic/claude-haiku-4-5"),
    tools: [],
    overrides: {
      systemPromptLoader: () => Promise.resolve(TITLE_PROMPT),
    },
  });

  const events$ = agent.runTask(userMessage);

  // Wait for task completion
  await lastValueFrom(events$, { defaultValue: null });

  // Get text from the last assistant message
  const messages = agent.messages;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "assistant") {
    const text = extractText(lastMessage.content);
    return text.trim() || "New Chat";
  }

  return "New Chat";
}
