import * as crypto from "crypto";

export function computeProjectHash(
  toolName: string,
  paths: string[],
  focusQuery?: string
): string {
  const normalized = paths
    .map((p) => p.replace(/\\/g, "/"))
    .sort()
    .join("|");

  const input = `${toolName}:${normalized}:${focusQuery ?? ""}`;
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 16);
}
