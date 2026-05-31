import type { ToolDependencies } from "../types.js";
import { VALIDATE_APPROACH_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildValidateApproachPrompt } from "../prompts/validate-approach.js";
import { APPROACH_VALIDATION_SCHEMA } from "../schemas/approach-validation.js";

export const validateApproachTool = {
  name: "gemini_validate_approach",
  description:
    "Validates an architectural or implementation approach before committing to it. " +
    "Identifies trade-offs, potential failure modes, alternatives, and red flags. " +
    "Use before making significant architectural decisions.",
  inputSchema: {
    type: "object" as const,
    properties: {
      approach: { type: "string", description: "Description of the approach or decision to validate." },
      alternatives_considered: {
        type: "array",
        items: { type: "string" },
        description: "Alternatives already considered and rejected.",
      },
    },
    required: ["approach"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { approach, alternatives_considered } = args as {
      approach: string;
      alternatives_considered?: string[];
    };

    const userPrompt = buildValidateApproachPrompt(approach, alternatives_considered);

    const response = await deps.geminiClient.call({
      systemPrompt: VALIDATE_APPROACH_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: APPROACH_VALIDATION_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("validate_approach", response.content);

    return {
      validation: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
