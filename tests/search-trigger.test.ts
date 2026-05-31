import { describe, it, expect } from "vitest";
import { detectVersionSignals } from "../src/search/version-detector.js";
import { WebSearchTrigger } from "../src/search/trigger.js";

// ---------------------------------------------------------------------------
// detectVersionSignals
// ---------------------------------------------------------------------------

describe("detectVersionSignals", () => {
  it("returns empty array for empty map", () => {
    const result = detectVersionSignals(new Map());
    expect(result).toEqual([]);
  });

  it("parses package.json and returns signal for known post-cutoff package (react@20.0.0)", () => {
    const pkg = JSON.stringify({
      dependencies: { react: "20.0.0" },
    });
    const result = detectVersionSignals(new Map([["project/package.json", pkg]]));
    expect(result).toHaveLength(1);
    expect(result[0].packageName).toBe("react");
    expect(result[0].version).toBe("20.0.0");
    expect(result[0].source).toBe("project/package.json");
    expect(result[0].estimatedReleaseDate).toBeInstanceOf(Date);
  });

  it("does NOT return signal for pre-cutoff packages (react@18.0.0)", () => {
    const pkg = JSON.stringify({
      dependencies: { react: "18.0.0" },
    });
    const result = detectVersionSignals(new Map([["package.json", pkg]]));
    expect(result).toHaveLength(0);
  });

  it("handles malformed package.json gracefully (no throw, returns [])", () => {
    const result = detectVersionSignals(new Map([["package.json", "{ not valid json :::"]]));    expect(result).toEqual([]);
  });

  it("parses devDependencies and peerDependencies in package.json", () => {
    const pkg = JSON.stringify({
      devDependencies: { typescript: "5.9.0" },
      peerDependencies: { vite: "7.0.0" },
    });
    const result = detectVersionSignals(new Map([["package.json", pkg]]));
    const names = result.map((s) => s.packageName);
    expect(names).toContain("typescript");
    expect(names).toContain("vite");
  });

  it("strips semver range prefixes (^, ~, >=) before comparing versions", () => {
    const pkg = JSON.stringify({
      dependencies: { react: "^20.0.0" },
    });
    const result = detectVersionSignals(new Map([["package.json", pkg]]));
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe("20.0.0");
  });

  it("parses requirements.txt format (returns [] since estimatePypiReleaseDate returns null)", () => {
    const reqs = "django>=4.2.0\nrequests==2.31.0\n";
    const result = detectVersionSignals(new Map([["requirements.txt", reqs]]));
    // Python packages currently return null from estimatePypiReleaseDate
    expect(result).toEqual([]);
  });

  it("parses Cargo.toml format (returns [] since estimateCratesReleaseDate returns null)", () => {
    const cargo = `[dependencies]\nserde = "1.0.193"\ntokio = "1.35.0"\n`;
    const result = detectVersionSignals(new Map([["Cargo.toml", cargo]]));
    // Rust packages currently return null from estimateCratesReleaseDate
    expect(result).toEqual([]);
  });

  it("minor version threshold works: typescript@5.9.0 → signal", () => {
    const pkg = JSON.stringify({ dependencies: { typescript: "5.9.0" } });
    const result = detectVersionSignals(new Map([["package.json", pkg]]));
    expect(result).toHaveLength(1);
    expect(result[0].packageName).toBe("typescript");
  });

  it("minor version threshold works: typescript@5.8.0 → no signal", () => {
    const pkg = JSON.stringify({ dependencies: { typescript: "5.8.0" } });
    const result = detectVersionSignals(new Map([["package.json", pkg]]));
    expect(result).toHaveLength(0);
  });

  it("minor version threshold works: typescript@5.10.0 → signal (minor exceeds threshold)", () => {
    const pkg = JSON.stringify({ dependencies: { typescript: "5.10.0" } });
    const result = detectVersionSignals(new Map([["package.json", pkg]]));
    expect(result).toHaveLength(1);
  });

  it("unknown packages are ignored", () => {
    const pkg = JSON.stringify({ dependencies: { "some-unknown-lib": "99.0.0" } });
    const result = detectVersionSignals(new Map([["package.json", pkg]]));
    expect(result).toHaveLength(0);
  });

  it("handles multiple files in the map", () => {
    const pkg = JSON.stringify({ dependencies: { react: "20.0.0", next: "16.0.0" } });
    const reqs = "django>=4.2.0\n";
    const files = new Map([
      ["app/package.json", pkg],
      ["requirements.txt", reqs],
    ]);
    const result = detectVersionSignals(files);
    const names = result.map((s) => s.packageName);
    expect(names).toContain("react");
    expect(names).toContain("next");
  });
});

// ---------------------------------------------------------------------------
// WebSearchTrigger.analyze()
// ---------------------------------------------------------------------------

describe("WebSearchTrigger.analyze()", () => {
  // analyze() performs purely local version detection — GeminiClient is never called.
  const trigger = new WebSearchTrigger(null as any);

  it("returns shouldSearch: false when no post-cutoff packages are detected", async () => {
    const pkg = JSON.stringify({ dependencies: { react: "18.0.0" } });
    const ctx = await trigger.analyze(new Map([["package.json", pkg]]));
    expect(ctx.shouldSearch).toBe(false);
    expect(ctx.searchQueries).toEqual([]);
    expect(ctx.triggerReasons).toEqual([]);
  });

  it("returns shouldSearch: false for empty file map", async () => {
    const ctx = await trigger.analyze(new Map());
    expect(ctx.shouldSearch).toBe(false);
  });

  it("returns shouldSearch: true when a post-cutoff package is detected (react@20.0.0)", async () => {
    const pkg = JSON.stringify({ dependencies: { react: "20.0.0" } });
    const ctx = await trigger.analyze(new Map([["package.json", pkg]]));
    expect(ctx.shouldSearch).toBe(true);
  });

  it("query format is '{packageName} {version} API documentation changelog'", async () => {
    const pkg = JSON.stringify({ dependencies: { react: "20.0.0" } });
    const ctx = await trigger.analyze(new Map([["package.json", pkg]]));
    expect(ctx.searchQueries).toHaveLength(1);
    expect(ctx.searchQueries[0]).toBe("react 20.0.0 API documentation changelog");
  });

  it("triggerReasons contains the package name and version", async () => {
    const pkg = JSON.stringify({ dependencies: { react: "20.0.0" } });
    const ctx = await trigger.analyze(new Map([["package.json", pkg]]));
    expect(ctx.triggerReasons).toHaveLength(1);
    expect(ctx.triggerReasons[0]).toContain("react");
    expect(ctx.triggerReasons[0]).toContain("20.0.0");
  });

  it("produces one query and reason per post-cutoff package", async () => {
    const pkg = JSON.stringify({ dependencies: { react: "20.0.0", next: "16.0.0", vite: "7.0.0" } });
    const ctx = await trigger.analyze(new Map([["package.json", pkg]]));
    expect(ctx.shouldSearch).toBe(true);
    expect(ctx.searchQueries).toHaveLength(3);
    expect(ctx.triggerReasons).toHaveLength(3);
  });

  it("triggerReasons include the post-cutoff date string", async () => {
    const pkg = JSON.stringify({ dependencies: { react: "20.0.0" } });
    const ctx = await trigger.analyze(new Map([["package.json", pkg]]));
    expect(ctx.triggerReasons[0]).toContain("post-cutoff:");
    expect(ctx.triggerReasons[0]).toContain("2026-02-15");
  });
});
