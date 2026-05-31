import type { ToolDependencies } from "../types.js";
import { GENERATE_PLAN_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildGeneratePlanPrompt } from "../prompts/generate-plan.js";
import { IMPLEMENTATION_PLAN_SCHEMA } from "../schemas/implementation-plan.js";

export const generatePlanTool = {
  name: "gemini_generate_plan",
  description:
    "Generates a detailed step-by-step implementation plan for a coding task. " +
    "Call this before starting a complex feature to validate the approach and identify " +
    "potential issues before writing code. Returns ordered steps with estimated complexity.",
  inputSchema: {
    type: "object" as const,
    properties: {
      task: { type: "string", description: "Description of what needs to be implemented." },
      constraints: {
        type: "array",
        items: { type: "string" },
        description: "Technical constraints, existing patterns to follow, or things to avoid.",
      },
      codebase_context: {
        type: "string",
        description: "Optional: paste the output of gemini_read_codebase here for context.",
      },
    },
    required: ["task"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { task, constraints, codebase_context } = args as {
      task: string;
      constraints?: string[];
      codebase_context?: string;
    };

    const userPrompt = buildGeneratePlanPrompt(task, constraints, codebase_context);

    const response = await deps.geminiClient.call({
      systemPrompt: GENERATE_PLAN_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: IMPLEMENTATION_PLAN_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("generate_plan", response.content);

    return {
      plan: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
