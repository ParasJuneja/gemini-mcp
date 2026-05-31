import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolDependencies } from "./types.js";

import { contextCostTool } from "./tools/context-cost.js";
import { shrinkLogsTool } from "./tools/shrink-logs.js";
import { explainErrorTool } from "./tools/explain-error.js";
import { summarizeDiffTool } from "./tools/summarize-diff.js";
import { reviewCodeTool } from "./tools/review-code.js";
import { generatePlanTool } from "./tools/generate-plan.js";
import { validateApproachTool } from "./tools/validate-approach.js";
import { writeTestsTool } from "./tools/write-tests.js";
import { writeBoilerplateTool } from "./tools/write-boilerplate.js";
import { grepSemanticTool } from "./tools/grep-semantic.js";
import { readCodebaseTool } from "./tools/read-codebase.js";

const TOOL_REGISTRY = [
  contextCostTool,
  shrinkLogsTool,
  explainErrorTool,
  summarizeDiffTool,
  reviewCodeTool,
  generatePlanTool,
  validateApproachTool,
  writeTestsTool,
  writeBoilerplateTool,
  grepSemanticTool,
  readCodebaseTool,
];

export function registerAllTools(server: Server, deps: ToolDependencies): void {
  // Register tools with schema cost monitor
  for (const tool of TOOL_REGISTRY) {
    deps.schemaCostMonitor.register(tool.name, tool.description, tool.inputSchema);
  }

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_REGISTRY.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOL_REGISTRY.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(request.params.arguments ?? {}, deps);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const handled = deps.degradationHandler.handle(err);
      return {
        content: [{ type: "text", text: JSON.stringify(handled, null, 2) }],
        isError: !handled.recoverable,
      };
    }
  });
}
