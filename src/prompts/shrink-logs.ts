export function buildShrinkLogsPrompt(
  logContent: string,
  logType: string,
  focus?: string
): string {
  const focusSection = focus ? `\nFOCUS: ${focus}` : "";
  return `LOG TYPE: ${logType}${focusSection}\n\nLOG CONTENT:\n${logContent}`;
}
