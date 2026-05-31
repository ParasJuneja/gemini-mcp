import type { ToolDependencies } from "../types.js";
import { readFiles } from "../utils/file-reader.js";
import { READ_CODEBASE_SYSTEM_PROMPT } from "../prompts/system-base.js";
import { buildReadCodebasePrompt } from "../prompts/read-codebase.js";
import { CODEBASE_SUMMARY_SCHEMA } from "../schemas/codebase-summary.js";

export const readCodebaseTool = {
  name: "gemini_read_codebase",
  description:
    "Reads and summarizes an entire codebase directory using Gemini's 1M token context window. " +
    "Returns a structured summary of architecture, relevant files, and key symbols focused on your query. " +
    "Use this instead of reading individual files when you need to understand a large codebase or " +
    "find where functionality is implemented across many files. " +
    "Results are cached by file modification times — repeat calls on unchanged code are instant.",
  inputSchema: {
    type: "object" as const,
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Array of directory or file paths to analyze. Can be relative or absolute.",
      },
      focus_query: {
        type: "string",
        description: "What you want to understand about the codebase. Be specific.",
      },
      exclude_patterns: {
        type: "array",
        items: { type: "string" },
        description: "Glob patterns to exclude from analysis.",
      },
    },
    required: ["paths", "focus_query"],
  },
  handler: async (args: unknown, deps: ToolDependencies) => {
    const { paths, focus_query, exclude_patterns } = args as {
      paths: string[];
      focus_query: string;
      exclude_patterns?: string[];
    };

    // Read files first so we have individual file paths for the cache key.
    // Using directory paths for get() but file paths for set() produces different
    // hashes, so the cache would always miss. Individual paths also enable per-file
    // mtime tracking.
    const files = await readFiles(paths, exclude_patterns);
    if (files.length === 0) {
      return { error: "No readable files found at the specified paths." };
    }

    const allFilePaths = files.map((f) => f.path);

    const cached = await deps.cacheManager.get("read_codebase", allFilePaths, focus_query);
    if (cached) {
      return { ...cached.summary as object, _cache: "hit" };
    }

    const fileMap = new Map(files.map((f) => [f.path, f.content]));
    const searchContext = await deps.webSearchTrigger.analyze(fileMap);

    const userPrompt = buildReadCodebasePrompt(files, focus_query, searchContext);

    const response = await deps.geminiClient.call({
      systemPrompt: READ_CODEBASE_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: CODEBASE_SUMMARY_SCHEMA,
      useWebSearch: searchContext.shouldSearch,
      temperature: 0,
    });
    const verificationResult = await deps.verifier.verify(response.content, allFilePaths);
    const sanitized = deps.sanitizer.sanitize("read_codebase", verificationResult.annotatedSummary);

    const result = {
      summary: verificationResult.annotatedSummary,
      verification: {
        unverified_count: verificationResult.unverifiedIdentifiers.length,
        unverified_identifiers: verificationResult.unverifiedIdentifiers,
        web_sourced_identifiers: verificationResult.webSourcedIdentifiers,
      },
      web_search: searchContext.shouldSearch
        ? { triggered: true, reasons: searchContext.triggerReasons }
        : { triggered: false },
      files_analyzed: files.length,
      _framed_content: sanitized.framedContent,
    };

    await deps.cacheManager.set("read_codebase", allFilePaths, result, focus_query);

    return result;
  },
};
