export function buildExplainErrorPrompt(
  errorMessage: string,
  codeContext?: string,
  language?: string
): string {
  const languageSection = language ? `LANGUAGE: ${language}\n` : "";
  const codeSection = codeContext
    ? `\n\nCODE CONTEXT:\n${codeContext}`
    : "";
  return `${languageSection}ERROR:\n${errorMessage}${codeSection}`;
}
