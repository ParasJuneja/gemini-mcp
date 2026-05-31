import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { readCodebaseTool } from "../../src/tools/read-codebase.js";
import { CacheManager } from "../../src/cache/manager.js";
import { StructuralVerifier } from "../../src/verification/verifier.js";
import { OutputSanitizer } from "../../src/sanitization/sanitizer.js";
import { GracefulDegradationHandler } from "../../src/degradation/handler.js";
import type { ToolDependencies } from "../../src/types.js";

let tmpDir: string;

async function setupTmpDir(): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-read-test-"));
  await fs.writeFile(path.join(tmpDir, "index.ts"), "export function main() { return 42; }");
  await fs.writeFile(path.join(tmpDir, "utils.ts"), "export function add(a: number, b: number) { return a + b; }");
  return tmpDir;
}

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
  delete process.env.CACHE_DIR;
});

function makeDeps(cacheDir: string, geminiContent: unknown): Partial<ToolDependencies> {
  process.env.CACHE_DIR = cacheDir;
  return {
    geminiClient: {
      call: vi.fn().mockResolvedValue({ content: geminiContent, rawText: "" }),
    } as any,
    cacheManager: new CacheManager(),
    verifier: new StructuralVerifier(),
    sanitizer: new OutputSanitizer(),
    webSearchTrigger: {
      analyze: vi.fn().mockResolvedValue({ shouldSearch: false, searchQueries: [], triggerReasons: [] }),
    } as any,
    degradationHandler: new GracefulDegradationHandler(),
  };
}

const MOCK_SUMMARY = {
  architecture_overview: "A small TypeScript utility library.",
  tech_stack: ["TypeScript"],
  relevant_files: [{ path: "index.ts", relevance: "Main entry point" }],
  key_symbols: [{ name: "main", type: "function", file: "index.ts", description: "Returns 42" }],
  entry_points: ["index.ts"],
};

describe("readCodebaseTool", () => {
  it("has the correct tool name", () => {
    expect(readCodebaseTool.name).toBe("gemini_read_codebase");
  });

  it("reads files and calls Gemini on first invocation", async () => {
    const dir = await setupTmpDir();
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-cache-"));

    const deps = makeDeps(cacheDir, MOCK_SUMMARY);
    const result = await readCodebaseTool.handler(
      { paths: [dir], focus_query: "main function" },
      deps as ToolDependencies
    ) as any;

    expect(deps.geminiClient!.call).toHaveBeenCalledOnce();
    expect(result.files_analyzed).toBeGreaterThan(0);
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("verification");
    expect(result).toHaveProperty("web_search");

    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("returns a cache hit on second call without calling Gemini again", async () => {
    const dir = await setupTmpDir();
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-cache-"));

    const deps = makeDeps(cacheDir, MOCK_SUMMARY);

    // Use directory paths (the natural usage) — the tool expands to individual
    // file paths internally and uses them consistently for both get() and set()
    const paths = [dir];

    // First call — hits Gemini
    await readCodebaseTool.handler(
      { paths, focus_query: "cache test" },
      deps as ToolDependencies
    );

    // Second call — should hit cache (same deps instance shares L1 in-memory cache)
    const result2 = await readCodebaseTool.handler(
      { paths, focus_query: "cache test" },
      deps as ToolDependencies
    ) as any;

    expect(deps.geminiClient!.call).toHaveBeenCalledOnce(); // still just 1 call
    expect(result2._cache).toBe("hit");

    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("returns error when no readable files found", async () => {
    const dir = await setupTmpDir();
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-cache-"));

    const deps = makeDeps(cacheDir, MOCK_SUMMARY);

    // Pass a path that has no files
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-empty-"));
    const result = await readCodebaseTool.handler(
      { paths: [emptyDir], focus_query: "anything" },
      deps as ToolDependencies
    ) as any;

    expect(result).toHaveProperty("error");
    expect(deps.geminiClient!.call).not.toHaveBeenCalled();

    await fs.rm(emptyDir, { recursive: true, force: true });
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("includes web_search triggered flag when web search fires", async () => {
    const dir = await setupTmpDir();
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-cache-"));

    const deps = makeDeps(cacheDir, MOCK_SUMMARY);
    (deps.webSearchTrigger!.analyze as any).mockResolvedValue({
      shouldSearch: true,
      searchQueries: ["react 20 changelog"],
      triggerReasons: ["react@20.0.0 detected"],
    });

    const result = await readCodebaseTool.handler(
      { paths: [dir], focus_query: "react usage" },
      deps as ToolDependencies
    ) as any;

    expect(result.web_search.triggered).toBe(true);
    expect(result.web_search.reasons).toContain("react@20.0.0 detected");

    await fs.rm(cacheDir, { recursive: true, force: true });
  });
});
