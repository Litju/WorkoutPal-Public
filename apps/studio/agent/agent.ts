import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

const opencodeGo = createOpenAI({
  // OpenCode Go exposes GPT 5.6 Luna through its OpenAI Responses-compatible
  // endpoint. Keep this credential separate from provider-specific OpenAI keys
  // and from Vercel AI Gateway credentials.
  apiKey: process.env.OPENCODE_GO_API_KEY ?? "",
  baseURL:
    process.env.WORKOUTPAL_AGENT_BASE_URL ?? "https://opencode.ai/zen/go/v1",
  name: "opencode-go",
});

export default defineAgent({
  // One explicitly configured OpenCode Go model for F6. Credentials stay in
  // the deployment environment; the model is never selected by the user.
  model: opencodeGo.responses(
    process.env.WORKOUTPAL_AGENT_MODEL ?? "gpt-5.6-luna",
  ),
  // OpenCode Go is not present in Eve's AI Gateway catalog. Keep Eve's
  // compaction/runtime accounting bounded to the F6 session ceiling.
  modelContextWindowTokens: 200_000,
  reasoning: "low",
  compaction: { thresholdPercent: 0.8 },
  limits: {
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1000,
    maxInputTokensPerSession: 200_000,
    maxOutputTokensPerSession: 50_000,
  },
});
