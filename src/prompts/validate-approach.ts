export function buildValidateApproachPrompt(
  approach: string,
  alternativesConsidered?: string[]
): string {
  const altSection = alternativesConsidered && alternativesConsidered.length > 0
    ? `\nALTERNATIVES ALREADY CONSIDERED:\n${alternativesConsidered.map((a) => `- ${a}`).join("\n")}`
    : "";
  return `APPROACH TO VALIDATE:\n${approach}${altSection}`;
}
