import type { FileContent } from "../utils/file-reader.js";

export function buildGrepSemanticPrompt(
  files: FileContent[],
  query: string,
  maxResults: number
): string {
  const fileSection = files
    .map((f) => `=== FILE: ${f.path} ===\n${f.content}`)
    .join("\n\n");

  return `SEARCH QUERY: ${query}\nMAX RESULTS: ${maxResults}\n\nCODEBASE FILES:\n\n${fileSection}`;
}
