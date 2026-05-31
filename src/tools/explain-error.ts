import type { ToolDependencies } from "../types.js";
import { EXPLAIN_ERROR_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildExplainErrorPrompt } from "../prompts/explain-error.js";
import { ERROR_EXPLANATION_SCHEMA } from "../schemas/error-explanation.js";

export const explainErrorTool = {
  name: "gemini_explain_error",
  description:
    "Explains a code error with root cause analysis, relevant documentation, and a concrete fix. " +
    "More thorough than inline error explanation — send complex or unfamiliar errors here.",
  inputSchema: {
    type: "object" as const,
    properties: {
      error_message: { type: "string", description: "The full error message and stack trace." },
      code_context: { type: "string", description: "The code surrounding where the error occurred." },
      language: { type: "string", description: "Programming language." },
    },
    required: ["error_message"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { error_message, code_context, language } = args as {
      error_message: string;
      code_context?: string;
      language?: string;
    };

    const userPrompt = buildExplainErrorPrompt(error_message, code_context, language);

    const response = await deps.geminiClient.call({
      systemPrompt: EXPLAIN_ERROR_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: ERROR_EXPLANATION_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("explain_error", response.content);

    return {
      explanation: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
