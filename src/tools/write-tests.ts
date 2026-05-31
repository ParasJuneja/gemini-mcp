import type { ToolDependencies } from "../types.js";
import { WRITE_TESTS_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildWriteTestsPrompt } from "../prompts/write-tests.js";
import { TEST_SUITE_SCHEMA } from "../schemas/test-suite.js";

export const writeTestsTool = {
  name: "gemini_write_tests",
  description:
    "Generates a comprehensive test suite for a function or module. " +
    "Auto-detects testing framework from imports and project structure. " +
    "Covers happy paths, edge cases, error cases, and boundary conditions.",
  inputSchema: {
    type: "object" as const,
    properties: {
      code: { type: "string", description: "The function or module to generate tests for." },
      language: { type: "string", description: "Programming language." },
      framework_hint: {
        type: "string",
        description: "Optional: testing framework to use. If not provided, Gemini will infer from the code.",
      },
      existing_tests: {
        type: "string",
        description: "Optional: existing test file for this module so Gemini can follow existing patterns.",
      },
    },
    required: ["code", "language"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { code, language, framework_hint, existing_tests } = args as {
      code: string;
      language: string;
      framework_hint?: string;
      existing_tests?: string;
    };

    const userPrompt = buildWriteTestsPrompt(code, language, framework_hint, existing_tests);

    const response = await deps.geminiClient.call({
      systemPrompt: WRITE_TESTS_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: TEST_SUITE_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const sanitized = deps.sanitizer.sanitize("write_tests", response.content);

    return {
      tests: response.content,
      _framed_content: sanitized.framedContent,
    };
  },
};
