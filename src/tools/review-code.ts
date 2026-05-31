import type { ToolDependencies } from "../types.js";
import { REVIEW_CODE_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildReviewCodePrompt } from "../prompts/review-code.js";
import { CODE_REVIEW_SCHEMA } from "../schemas/code-review.js";

export const reviewCodeTool = {
  name: "gemini_review_code",
  description:
    "Reviews code for security vulnerabilities (OWASP categories), performance issues, " +
    "architectural problems, and refactoring opportunities. " +
    "Provides structured findings with severity, category, location, and suggested fix.",
  inputSchema: {
    type: "object" as const,
    properties: {
      code: { type: "string", description: "The code to review." },
      language: { type: "string", description: "Programming language." },
      focus: {
        type: "array",
        items: { type: "string", enum: ["security", "performance", "architecture", "maintainability", "all"] },
        description: "Which aspects to focus the review on. Default: all.",
      },
      file_path: { type: "string", description: "Optional: file path context for more accurate analysis." },
    },
    required: ["code", "language"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { code, language, focus = ["all"], file_path } = args as {
      code: string;
      language: string;
      focus?: string[];
      file_path?: string;
    };

    const userPrompt = buildReviewCodePrompt(code, language, focus, file_path);

    const response = await deps.geminiClient.call({
      systemPrompt: REVIEW_CODE_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: CODE_REVIEW_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("review_code", response.content);

    return {
      review: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
