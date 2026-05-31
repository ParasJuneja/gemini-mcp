export function buildWriteBoilerplatePrompt(
  spec: string,
  language: string,
  framework?: string,
  styleContext?: string
): string {
  const frameworkSection = framework ? `\nFRAMEWORK: ${framework}` : "";
  const styleSection = styleContext
    ? `\n\nSTYLE REFERENCE (match this style):\n${styleContext}`
    : "";
  return `LANGUAGE: ${language}${frameworkSection}\n\nSPECIFICATION:\n${spec}${styleSection}`;
}
