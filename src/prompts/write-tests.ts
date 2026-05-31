export function buildWriteTestsPrompt(
  code: string,
  language: string,
  frameworkHint?: string,
  existingTests?: string
): string {
  const frameworkSection = frameworkHint ? `\nFRAMEWORK: ${frameworkHint}` : "";
  const existingSection = existingTests
    ? `\n\nEXISTING TESTS (follow this style):\n${existingTests}`
    : "";
  return `LANGUAGE: ${language}${frameworkSection}\n\nCODE TO TEST:\n${code}${existingSection}`;
}
