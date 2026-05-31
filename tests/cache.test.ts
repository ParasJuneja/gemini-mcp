import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { computeProjectHash } from "../src/cache/hash.js";
import { FileStore } from "../src/cache/store.js";
import { CacheManager } from "../src/cache/manager.js";

// ─── computeProjectHash ───────────────────────────────────────────────────────

describe("computeProjectHash", () => {
  it("produces the same hash for identical inputs", () => {
    const h1 = computeProjectHash("analyze", ["/a/b.ts", "/c/d.ts"], "query");
    const h2 = computeProjectHash("analyze", ["/a/b.ts", "/c/d.ts"], "query");
    expect(h1).toBe(h2);
  });

  it("is order-independent for paths", () => {
    const h1 = computeProjectHash("analyze", ["/a/b.ts", "/c/d.ts"]);
    const h2 = computeProjectHash("analyze", ["/c/d.ts", "/a/b.ts"]);
    expect(h1).toBe(h2);
  });

  it("differs when toolName changes", () => {
    const h1 = computeProjectHash("analyze", ["/a/b.ts"]);
    const h2 = computeProjectHash("search", ["/a/b.ts"]);
    expect(h1).not.toBe(h2);
  });

  it("differs when paths change", () => {
    const h1 = computeProjectHash("analyze", ["/a/b.ts"]);
    const h2 = computeProjectHash("analyze", ["/a/c.ts"]);
    expect(h1).not.toBe(h2);
  });

  it("differs when focusQuery changes", () => {
    const h1 = computeProjectHash("analyze", ["/a/b.ts"], "foo");
    const h2 = computeProjectHash("analyze", ["/a/b.ts"], "bar");
    expect(h1).not.toBe(h2);
  });

  it("differs when focusQuery is present vs absent", () => {
    const h1 = computeProjectHash("analyze", ["/a/b.ts"]);
    const h2 = computeProjectHash("analyze", ["/a/b.ts"], "something");
    expect(h1).not.toBe(h2);
  });

  it("returns a 16-character hex string", () => {
    const h = computeProjectHash("tool", ["/x/y.ts"]);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ─── FileStore ────────────────────────────────────────────────────────────────

describe("FileStore", () => {
  let tmpDir: string;
  let store: FileStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-store-"));
    store = new FileStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null for a nonexistent hash", async () => {
    const result = await store.read("nonexistent");
    expect(result).toBeNull();
  });

  it("write then read returns the same data", async () => {
    const data = { foo: "bar", num: 42, arr: [1, 2, 3] };
    await store.write("testhash", data);
    const result = await store.read("testhash");
    expect(result).toEqual(data);
  });

  it("overwrites existing data on second write", async () => {
    await store.write("testhash", { version: 1 });
    await store.write("testhash", { version: 2 });
    const result = await store.read("testhash") as { version: number };
    expect(result.version).toBe(2);
  });

  it("creates cache directory if it does not exist", async () => {
    const nestedDir = path.join(tmpDir, "nested", "deep");
    const nestedStore = new FileStore(nestedDir);
    await nestedStore.write("hash123", { ok: true });
    const result = await nestedStore.read("hash123");
    expect(result).toEqual({ ok: true });
  });
});

// ─── CacheManager ─────────────────────────────────────────────────────────────

describe("CacheManager", () => {
  let tmpDir: string;
  let tmpFile: string;
  let originalCacheDir: string | undefined;
  let originalMaxAge: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-mcp-cache-"));
    tmpFile = path.join(tmpDir, "test-file.txt");
    await fs.writeFile(tmpFile, "hello world", "utf-8");

    originalCacheDir = process.env.CACHE_DIR;
    originalMaxAge = process.env.CACHE_MAX_AGE_MS;

    // Point cache to temp dir so tests are isolated
    process.env.CACHE_DIR = path.join(tmpDir, "cache");
  });

  afterEach(async () => {
    // Restore env vars
    if (originalCacheDir === undefined) {
      delete process.env.CACHE_DIR;
    } else {
      process.env.CACHE_DIR = originalCacheDir;
    }
    if (originalMaxAge === undefined) {
      delete process.env.CACHE_MAX_AGE_MS;
    } else {
      process.env.CACHE_MAX_AGE_MS = originalMaxAge;
    }

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null on initial get (L1 + L2 miss)", async () => {
    const manager = new CacheManager();
    const result = await manager.get("analyze", [tmpFile]);
    expect(result).toBeNull();
  });

  it("returns cached entry on get after set (L1 hit)", async () => {
    const manager = new CacheManager();
    const summary = { analysis: "done", files: 1 };
    await manager.set("analyze", [tmpFile], summary);

    const result = await manager.get("analyze", [tmpFile]);
    expect(result).not.toBeNull();
    expect(result!.summary).toEqual(summary);
    expect(result!.toolName).toBe("analyze");
    expect(result!.paths).toEqual([tmpFile]);
  });

  it("L1 hit on second get without disk I/O path", async () => {
    const manager = new CacheManager();
    await manager.set("analyze", [tmpFile], { data: "x" });

    // First get populates L1
    const r1 = await manager.get("analyze", [tmpFile]);
    expect(r1).not.toBeNull();

    // Second get should also hit (L1)
    const r2 = await manager.get("analyze", [tmpFile]);
    expect(r2).not.toBeNull();
    expect(r2!.summary).toEqual({ data: "x" });
  });

  it("L2 hit after recreating CacheManager (fresh L1)", async () => {
    const cacheDir = process.env.CACHE_DIR!;

    // Write with first manager
    const manager1 = new CacheManager();
    await manager1.set("analyze", [tmpFile], { persisted: true });

    // New manager has empty L1 — should hit L2 (disk)
    const manager2 = new CacheManager();
    const result = await manager2.get("analyze", [tmpFile]);
    expect(result).not.toBeNull();
    expect(result!.summary).toEqual({ persisted: true });

    // Suppress unused var warning
    void cacheDir;
  });

  it("cache miss after file is modified (mtime change)", async () => {
    const manager = new CacheManager();
    await manager.set("analyze", [tmpFile], { original: true });

    // Verify hit first
    const hit = await manager.get("analyze", [tmpFile]);
    expect(hit).not.toBeNull();

    // Modify the file — use a new manager to clear L1
    await fs.writeFile(tmpFile, "modified content", "utf-8");
    // Touch to ensure mtime advances (in case fs is fast)
    const now = new Date(Date.now() + 1000);
    await fs.utimes(tmpFile, now, now);

    const manager2 = new CacheManager();
    const miss = await manager2.get("analyze", [tmpFile]);
    expect(miss).toBeNull();
  });

  it("cache miss when file count changes (new file added)", async () => {
    const manager = new CacheManager();
    const file2 = path.join(tmpDir, "second.txt");
    await manager.set("analyze", [tmpFile], { snapshot: 1 });

    // Add a new file that wasn't in the original set
    await fs.writeFile(file2, "new file", "utf-8");

    const manager2 = new CacheManager();
    // Get with an extra path — file count mismatch should cause stale
    const result = await manager2.get("analyze", [tmpFile, file2]);
    // This is a different hash (different paths), so it's a miss by definition
    expect(result).toBeNull();
  });

  it("cache miss when paths in metadata no longer match current paths", async () => {
    // Set with two files, then check with only one — count mismatch
    const file2 = path.join(tmpDir, "extra.txt");
    await fs.writeFile(file2, "extra", "utf-8");

    const manager1 = new CacheManager();
    await manager1.set("analyze", [tmpFile, file2], { both: true });

    // Delete file2 to simulate removal — now stat will return mtime:0,size:0
    await fs.rm(file2);

    // The entry has 2 fileMetadata entries; current metadata still has 2
    // (missing file gets mtime:0, size:0) but the mtime will differ (cached mtime > 0)
    const manager2 = new CacheManager();
    const result = await manager2.get("analyze", [tmpFile, file2]);
    expect(result).toBeNull();
  });

  it("cache miss when maxAge is exceeded", async () => {
    const manager = new CacheManager();
    await manager.set("analyze", [tmpFile], { aged: true });

    // Set maxAge to 0 so any entry is immediately stale
    process.env.CACHE_MAX_AGE_MS = "0";

    const manager2 = new CacheManager();
    const result = await manager2.get("analyze", [tmpFile]);
    expect(result).toBeNull();
  });

  it("focusQuery is part of the cache key", async () => {
    const manager = new CacheManager();
    await manager.set("analyze", [tmpFile], { q: "foo" }, "foo");
    await manager.set("analyze", [tmpFile], { q: "bar" }, "bar");

    const r1 = await manager.get("analyze", [tmpFile], "foo");
    const r2 = await manager.get("analyze", [tmpFile], "bar");
    const r3 = await manager.get("analyze", [tmpFile]); // no query

    expect(r1!.summary).toEqual({ q: "foo" });
    expect(r2!.summary).toEqual({ q: "bar" });
    expect(r3).toBeNull();
  });

  it("cachedAt is set to approximately now", async () => {
    const before = Date.now();
    const manager = new CacheManager();
    await manager.set("analyze", [tmpFile], {});
    const after = Date.now();

    const result = await manager.get("analyze", [tmpFile]);
    expect(result!.cachedAt).toBeGreaterThanOrEqual(before);
    expect(result!.cachedAt).toBeLessThanOrEqual(after);
  });
});
