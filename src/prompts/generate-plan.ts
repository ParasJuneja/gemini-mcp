export function buildGeneratePlanPrompt(
  task: string,
  constraints?: string[],
  codebaseContext?: string
): string {
  const constraintsSection = constraints && constraints.length > 0
    ? `\nCONSTRAINTS:\n${constraints.map((c) => `- ${c}`).join("\n")}`
    : "";
  const contextSection = codebaseContext
    ? `\n\nCODEBASE CONTEXT:\n${codebaseContext}`
    : "";
  return `TASK: ${task}${constraintsSection}${contextSection}`;
}
