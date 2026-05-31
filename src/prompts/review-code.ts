export function buildReviewCodePrompt(
  code: string,
  language: string,
  focus: string[],
  filePath?: string
): string {
  const fileSection = filePath ? `\nFILE: ${filePath}` : "";
  const focusSection = focus.includes("all") ? "all aspects" : focus.join(", ");
  return `LANGUAGE: ${language}${fileSection}\nFOCUS: ${focusSection}\n\nCODE:\n${code}`;
}
