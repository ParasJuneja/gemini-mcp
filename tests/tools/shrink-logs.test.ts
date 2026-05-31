import { describe, it, expect, vi } from "vitest";
import { shrinkLogsTool } from "../../src/tools/shrink-logs.js";
import { OutputSanitizer } from "../../src/sanitization/sanitizer.js";
import { GracefulDegradationHandler } from "../../src/degradation/handler.js";
import type { ToolDependencies } from "../../src/types.js";

function makeDeps(geminiResponse: unknown): Partial<ToolDependencies> {
  return {
    geminiClient: {
      call: vi.fn().mockResolvedValue({ content: geminiResponse, rawText: "" }),
    } as any,
    sanitizer: new OutputSanitizer(),
    degradationHandler: new GracefulDegradationHandler(),
  };
}

describe("shrinkLogsTool", () => {
  it("has the correct tool name", () => {
    expect(shrinkLogsTool.name).toBe("gemini_shrink_logs");
  });

  it("calls geminiClient.call with the correct schema", async () => {
    const mockContent = {
      error_count: 2,
      warning_count: 1,
      issues: [
        { severity: "error", message: "Cannot find module 'foo'", file: "src/index.ts", line: 5 },
        { severity: "error", message: "Type 'string' is not assignable to type 'number'", file: "src/bar.ts", line: 12 },
        { severity: "warning", message: "Unused variable 'x'", file: "src/baz.ts", line: 3 },
      ],
      summary: "2 errors, 1 warning found in TypeScript compiler output",
    };

    const deps = makeDeps(mockContent);
    const result = await shrinkLogsTool.handler(
      { log_content: "some log output", log_type: "compiler" },
      deps as ToolDependencies
    );

    expect(deps.geminiClient!.call).toHaveBeenCalledOnce();
    expect(result).toHaveProperty("analysis");
    expect(result).toHaveProperty("_framed_content");
  });

  it("returns analysis with error count from Gemini response", async () => {
    const mockContent = { error_count: 0, warning_count: 0, issues: [], summary: "No issues found." };
    const deps = makeDeps(mockContent);

    const result = await shrinkLogsTool.handler(
      { log_content: "Build succeeded.", log_type: "build" },
      deps as ToolDependencies
    ) as any;

    expect(result.analysis).toEqual(mockContent);
  });

  it("framed content contains the tool name in the framing markers", async () => {
    const deps = makeDeps({ error_count: 0, warning_count: 0, issues: [], summary: "ok" });
    const result = await shrinkLogsTool.handler(
      { log_content: "ok", log_type: "build" },
      deps as ToolDependencies
    ) as any;

    expect(result._framed_content).toContain("GEMINI_MCP:SHRINK_LOGS");
    expect(result._framed_content).toContain("END GEMINI_MCP:SHRINK_LOGS");
  });

  it("passes focus parameter to the prompt builder", async () => {
    const deps = makeDeps({ error_count: 0, warning_count: 0, issues: [], summary: "ok" });
    await shrinkLogsTool.handler(
      { log_content: "some log", log_type: "linter", focus: "TypeScript errors only" },
      deps as ToolDependencies
    );

    const callArg = (deps.geminiClient!.call as any).mock.calls[0][0];
    expect(callArg.userPrompt).toContain("TypeScript errors only");
  });
});
