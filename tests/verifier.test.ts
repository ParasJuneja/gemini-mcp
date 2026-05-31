import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { StructuralVerifier } from "../src/verification/verifier.js";

describe("StructuralVerifier", () => {
  let tmpDir: string;
  let verifier: StructuralVerifier;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-verifier-"));
    verifier = new StructuralVerifier();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // 1. Identifiers that exist in files → verifiedIdentifiers
  it("puts identifiers found in provided files into verifiedIdentifiers", async () => {
    const filePath = path.join(tmpDir, "source.ts");
    await fs.writeFile(filePath, "export function myFunctionName() { return 42; }", "utf-8");

    const summary = { description: "Uses myFunctionName to compute values" };
    const result = await verifier.verify(summary, [filePath]);

    expect(result.verifiedIdentifiers).toContain("myFunctionName");
    expect(result.unverifiedIdentifiers).not.toContain("myFunctionName");
  });

  // 2. Identifiers NOT in files → unverifiedIdentifiers with [UNVERIFIED] annotation
  it("puts identifiers not found in any file into unverifiedIdentifiers and annotates them", async () => {
    const filePath = path.join(tmpDir, "source.ts");
    await fs.writeFile(filePath, "// empty file with no relevant code", "utf-8");

    const summary = { description: "Uses phantomFunction to do something" };
    const result = await verifier.verify(summary, [filePath]);

    expect(result.unverifiedIdentifiers).toContain("phantomFunction");
    expect(result.verifiedIdentifiers).not.toContain("phantomFunction");

    const annotated = result.annotatedSummary as { description: string };
    expect(annotated.description).toContain("phantomFunction[UNVERIFIED]");
  });

  // 3. Web-sourced terms → webSourcedIdentifiers with [WEB_SOURCE] annotation
  it("moves web-sourced terms into webSourcedIdentifiers and annotates them", async () => {
    const filePath = path.join(tmpDir, "source.ts");
    await fs.writeFile(filePath, "// nothing here", "utf-8");

    const summary = { description: "Uses externalLibrary for parsing" };
    const result = await verifier.verify(summary, [filePath], ["externalLibrary"]);

    expect(result.webSourcedIdentifiers).toContain("externalLibrary");
    expect(result.unverifiedIdentifiers).not.toContain("externalLibrary");
    expect(result.verifiedIdentifiers).not.toContain("externalLibrary");

    const annotated = result.annotatedSummary as { description: string };
    expect(annotated.description).toContain("externalLibrary[WEB_SOURCE]");
  });

  // 4. Common words are NOT extracted as identifiers
  it("does not extract common words as identifiers", async () => {
    const filePath = path.join(tmpDir, "source.ts");
    await fs.writeFile(filePath, "the and for class interface", "utf-8");

    const summary = "the and for with this from that have are was were been";
    const result = await verifier.verify(summary, [filePath]);

    const allIds = [
      ...result.verifiedIdentifiers,
      ...result.unverifiedIdentifiers,
      ...result.webSourcedIdentifiers,
    ];
    const commonWords = ["the", "and", "for", "with", "this", "from", "that", "have", "are", "was", "were", "been"];
    for (const word of commonWords) {
      expect(allIds).not.toContain(word);
    }
  });

  // 5. No unverified/web-sourced → summary returned unchanged
  it("returns the original summary unchanged when all identifiers are verified", async () => {
    const filePath = path.join(tmpDir, "source.ts");
    await fs.writeFile(filePath, "function myVerifiedFunc() {} const myVerifiedConst = 1;", "utf-8");

    const summary = { fn: "myVerifiedFunc", val: "myVerifiedConst" };
    const result = await verifier.verify(summary, [filePath]);

    // When all identifiers are verified, summary should be structurally equal
    expect(result.annotatedSummary).toEqual(summary);
    expect(result.unverifiedIdentifiers).toHaveLength(0);
    expect(result.webSourcedIdentifiers).toHaveLength(0);
  });

  // 6. Nested object summary is correctly walked and annotated
  it("walks nested objects and annotates identifiers at every level", async () => {
    const filePath = path.join(tmpDir, "source.ts");
    await fs.writeFile(filePath, "// no real identifiers here", "utf-8");

    const summary = {
      top: "Uses topLevelFunc here",
      nested: {
        deep: "Also uses deepNestedFunc",
        arr: ["Array entry with arrayHelper used"],
      },
    };

    const result = await verifier.verify(summary, [filePath]);

    const annotated = result.annotatedSummary as typeof summary;
    expect(annotated.top).toContain("[UNVERIFIED]");
    expect(annotated.nested.deep).toContain("[UNVERIFIED]");
    expect(annotated.nested.arr[0]).toContain("[UNVERIFIED]");
  });

  // Extra: verify handles empty filePaths gracefully (all identifiers unverified)
  it("treats all identifiers as unverified when no files are provided", async () => {
    const summary = { description: "Uses uniqueIdentifierXyz" };
    const result = await verifier.verify(summary, []);

    expect(result.unverifiedIdentifiers).toContain("uniqueIdentifierXyz");
    expect(result.verifiedIdentifiers).toHaveLength(0);
  });

  // Extra: unreadable files are skipped without throwing
  it("skips unreadable files without throwing", async () => {
    const summary = { description: "Uses someIdentifierAbc" };
    const result = await verifier.verify(summary, ["/nonexistent/path/file.ts"]);

    // Should not throw; identifier goes unverified
    expect(result.unverifiedIdentifiers).toContain("someIdentifierAbc");
  });
});
