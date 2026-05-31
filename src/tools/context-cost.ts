import type { ToolDependencies } from "../types.js";

export const contextCostTool = {
  name: "gemini_context_cost",
  description:
    "Reports the estimated token cost of this MCP server's tool definitions in Claude's context window. " +
    "Use this to monitor schema overhead. Call periodically and report findings to adjust tool verbosity.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [] as string[],
  },
  handler: async (_args: unknown, deps: ToolDependencies) => {
    return deps.schemaCostMonitor.generateReport();
  },
};
