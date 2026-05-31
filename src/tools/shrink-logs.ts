import type { ToolDependencies } from "../types.js";
import { SHRINK_LOGS_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildShrinkLogsPrompt } from "../prompts/shrink-logs.js";
import { LOG_ANALYSIS_SCHEMA } from "../schemas/log-analysis.js";

export const shrinkLogsTool = {
  name: "gemini_shrink_logs",
  description:
    "Compresses large log files, build output, or test results to only the actionable errors and warnings. " +
    "Send raw log content here instead of reading logs directly into Claude's context. " +
    "Identifies error type, file location, line number, and suggested fix for each issue.",
  inputSchema: {
    type: "object" as const,
    properties: {
      log_content: { type: "string", description: "The raw log content to analyze." },
      log_type: {
        type: "string",
        enum: ["build", "test", "server", "compiler", "linter", "unknown"],
        description: "Type of log to help Gemini contextualize the errors.",
      },
      focus: {
        type: "string",
        description: "Optional: specific error type or component to focus on.",
      },
    },
    required: ["log_content", "log_type"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { log_content, log_type, focus } = args as {
      log_content: string;
      log_type: string;
      focus?: string;
    };

    const userPrompt = buildShrinkLogsPrompt(log_content, log_type, focus);

    const response = await deps.geminiClient.call({
      systemPrompt: SHRINK_LOGS_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: LOG_ANALYSIS_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("shrink_logs", response.content);

    return {
      analysis: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
