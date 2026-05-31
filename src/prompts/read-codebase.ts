import type { FileContent } from "../utils/file-reader.js";
import type { WebSearchContext } from "../search/trigger.js";

export function buildReadCodebasePrompt(
  files: FileContent[],
  focusQuery: string,
  searchContext: WebSearchContext
): string {
  const fileSection = files
    .map((f) => `=== FILE: ${f.path} ===\n${f.content}`)
    .join("\n\n");

  const searchSection = searchContext.shouldSearch
    ? `\n\nWEB SEARCH TRIGGERED for: ${searchContext.triggerReasons.join(", ")}\nSearch queries to run: ${searchContext.searchQueries.join(", ")}`
    : "";

  return `FOCUS QUERY: ${focusQuery}${searchSection}\n\nCODEBASE FILES:\n\n${fileSection}`;
}
