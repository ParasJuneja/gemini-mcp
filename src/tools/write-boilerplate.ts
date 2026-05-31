import type { ToolDependencies } from "../types.js";
import { WRITE_BOILERPLATE_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildWriteBoilerplatePrompt } from "../prompts/write-boilerplate.js";
import { BOILERPLATE_SCHEMA } from "../schemas/boilerplate.js";

export const writeBoilerplateTool = {
  name: "gemini_write_boilerplate",
  description:
    "Generates boilerplate code for common patterns: API routes, database models, " +
    "React components, CLI tools, config files, etc. " +
    "Follows the patterns and conventions in your existing codebase if context is provided.",
  inputSchema: {
    type: "object" as const,
    properties: {
      spec: { type: "string", description: "Description of what to generate. Be specific about requirements." },
      language: { type: "string", description: "Programming language." },
      framework: { type: "string", description: "Optional: framework to use." },
      style_context: {
        type: "string",
        description: "Optional: paste an example file from your codebase so Gemini can match your coding style.",
      },
    },
    required: ["spec", "language"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { spec, language, framework, style_context } = args as {
      spec: string;
      language: string;
      framework?: string;
      style_context?: string;
    };

    const userPrompt = buildWriteBoilerplatePrompt(spec, language, framework, style_context);

    const response = await deps.geminiClient.call({
      systemPrompt: WRITE_BOILERPLATE_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: BOILERPLATE_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("write_boilerplate", response.content);

    return {
      boilerplate: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
