import type { ToolDependencies } from "../types.js";
import { SUMMARIZE_DIFF_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildSummarizeDiffPrompt } from "../prompts/summarize-diff.js";
import { DIFF_SUMMARY_SCHEMA } from "../schemas/diff-summary.js";

export const summarizeDiffTool = {
  name: "gemini_summarize_diff",
  description:
    "Summarizes a Git diff or PR diff into a concise description of changes, impact, and potential risks. " +
    "Use this when a diff is too large to read directly in Claude's context.",
  inputSchema: {
    type: "object" as const,
    properties: {
      diff_content: { type: "string", description: "The raw git diff output." },
      context: { type: "string", description: "Optional: PR description or commit message to contextualize the diff." },
    },
    required: ["diff_content"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { diff_content, context } = args as {
      diff_content: string;
      context?: string;
    };

    const userPrompt = buildSummarizeDiffPrompt(diff_content, context);

    const response = await deps.geminiClient.call({
      systemPrompt: SUMMARIZE_DIFF_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: DIFF_SUMMARY_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("summarize_diff", response.content);

    return {
      summary: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
