import type { ToolDependencies } from "../types.js";
import { readFiles } from "../utils/file-reader.js";
import { GREP_SEMANTIC_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildGrepSemanticPrompt } from "../prompts/grep-semantic.js";
import { SEMANTIC_SEARCH_SCHEMA } from "../schemas/semantic-search.js";
import { DEFAULT_MAX_SEMANTIC_RESULTS } from "../utils/constants.js";

export const grepSemanticTool = {
  name: "gemini_grep_semantic",
  description:
    "Semantically searches a codebase for code matching a conceptual query. " +
    "Unlike grep, this understands intent — searching for 'where authentication tokens are validated' " +
    "will find the relevant code even if it doesn't literally contain those words. " +
    "Returns ranked list of relevant files with specific line ranges and explanations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Conceptual description of what you're looking for in the code." },
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Directories or files to search within.",
      },
      max_results: { type: "number", description: "Maximum number of results to return. Default: 10." },
    },
    required: ["query", "paths"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { query, paths, max_results = DEFAULT_MAX_SEMANTIC_RESULTS } = args as {
      query: string;
      paths: string[];
      max_results?: number;
    };

    const cached = await deps.cacheManager.get("grep_semantic", paths, query);
    if (cached) {
      return { ...cached.summary as object, _cache: "hit" };
    }

    const files = await readFiles(paths);
    const userPrompt = buildGrepSemanticPrompt(files, query, max_results);

    const response = await deps.geminiClient.call({
      systemPrompt: GREP_SEMANTIC_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: SEMANTIC_SEARCH_SCHEMA,
      useWebSearch: false,
      temperature: 0,
    });

    const allFilePaths = files.map((f) => f.path);
    const verified = await deps.verifier.verify(response.content, allFilePaths);
    const sanitized = deps.sanitizer.sanitize("grep_semantic", verified.annotatedSummary);

    const result = {
      results: verified.annotatedSummary,
      _framed_content: sanitized.framedContent,
    };

    await deps.cacheManager.set("grep_semantic", allFilePaths, result, query);
    return result;
  },
};
