export function buildSummarizeDiffPrompt(
  diffContent: string,
  context?: string
): string {
  const contextSection = context ? `\nCONTEXT: ${context}` : "";
  return `GIT DIFF:${contextSection}\n\n${diffContent}`;
}
