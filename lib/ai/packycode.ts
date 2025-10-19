import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const BASE_URL = "https://codex-api.packycode.com/v1";

export const packycodeModels = [
  { id: "packycode/gpt-5", modelName: "gpt-5" },
] as const;

export const packycodeProvider = createOpenAICompatible({
  name: "packycode",
  apiKey: process.env.PACKYCODE_API_KEY,
  baseURL: BASE_URL,
});
