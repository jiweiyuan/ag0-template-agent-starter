/**
 * Model Configuration Factory
 *
 * Supports:
 * - ANTHROPIC_API_KEY: Direct Anthropic API access (recommended for local dev)
 * - CORESPEED_USER_ID: CoreSpeed AI Gateway (for unified billing in production)
 */

import { anthropic, cloudflareGateway, type ModelProvider } from "@zypher/agent";

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
const gatewayUserId = Deno.env.get("CORESPEED_USER_ID");
const gatewayBaseUrl = Deno.env.get("AI_GATEWAY_URL") ??
  "https://gateway.ai.c7d.dev";

if (!anthropicApiKey && !gatewayUserId) {
  throw new Error(
    "Either ANTHROPIC_API_KEY or CORESPEED_USER_ID environment variable is required",
  );
}

/**
 * Create a model provider.
 *
 * @param modelId - The model ID
 *   - Direct API: "claude-sonnet-4-5-20250929"
 *   - CoreSpeed gateway: "anthropic/claude-sonnet-4-5-20250929"
 */
export function createModel(modelId: string): ModelProvider {
  if (gatewayUserId) {
    // Use CoreSpeed AI Gateway for unified billing
    return cloudflareGateway(modelId, {
      gatewayBaseUrl,
      apiToken: gatewayUserId,
      headers: {
        "User-Agent": "AG0-ZypherAgent/1.0",
      },
    });
  }
  // Direct Anthropic API
  return anthropic(modelId, { apiKey: anthropicApiKey! });
}
