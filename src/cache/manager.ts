import * as fs from "fs/promises";
import { computeProjectHash } from "./hash.js";
import { FileStore } from "./store.js";
import { logger } from "../utils/logger.js";
import { CACHE_DIR, CACHE_MAX_AGE_MS } from "../utils/constants.js";

export interface FileMetadata {
  path: string;
  mtime: number;
  size: number;
}

export interface CacheEntry {
  projectHash: string;
  summary: unknown;
  paths: string[];
  fileMetadata: FileMetadata[];
  cachedAt: number;
  toolName: string;
  focusQuery?: string;
}

export class CacheManager {
  private readonly l1: Map<string, CacheEntry> = new Map();
  private readonly store: FileStore;
  private readonly cacheDir: string;

  constructor() {
    this.cacheDir = process.env.CACHE_DIR ?? CACHE_DIR;
    this.store = new FileStore(this.cacheDir);
  }

  async get(
    toolName: string,
    paths: string[],
    focusQuery?: string
  ): Promise<CacheEntry | null> {
    const currentMetadata = await this.collectFileMetadata(paths);
    const hash = computeProjectHash(toolName, paths, focusQuery);

    const l1Entry = this.l1.get(hash);
    if (l1Entry && !this.isStale(l1Entry, currentMetadata)) {
      logger.debug(`Cache L1 hit: ${hash}`);
      return l1Entry;
    }

    const l2Data = await this.store.read(hash);
    if (l2Data) {
      const l2Entry = l2Data as CacheEntry;
      if (!this.isStale(l2Entry, currentMetadata)) {
        logger.debug(`Cache L2 hit: ${hash}`);
        this.l1.set(hash, l2Entry);
        return l2Entry;
      }
    }

    logger.debug(`Cache miss: ${hash}`);
    return null;
  }

  async set(
    toolName: string,
    paths: string[],
    summary: unknown,
    focusQuery?: string
  ): Promise<void> {
    const currentMetadata = await this.collectFileMetadata(paths);
    const hash = computeProjectHash(toolName, paths, focusQuery);

    const entry: CacheEntry = {
      projectHash: hash,
      summary,
      paths,
      fileMetadata: currentMetadata,
      cachedAt: Date.now(),
      toolName,
      focusQuery,
    };

    this.l1.set(hash, entry);
    await this.store.write(hash, entry);
    logger.debug(`Cache set: ${hash} (${paths.length} files)`);
  }

  private isStale(entry: CacheEntry, currentMetadata: FileMetadata[]): boolean {
    const maxAge = Number(process.env.CACHE_MAX_AGE_MS ?? CACHE_MAX_AGE_MS);
    if (Date.now() - entry.cachedAt > maxAge) {
      logger.debug("Cache entry exceeded max age");
      return true;
    }

    const cachedByPath = new Map(entry.fileMetadata.map((m) => [m.path, m]));
    for (const current of currentMetadata) {
      const cached = cachedByPath.get(current.path);
      if (!cached) {
        logger.debug(`New file detected (not in cache): ${current.path}`);
        return true;
      }
      if (current.mtime !== cached.mtime) {
        logger.debug(`File changed since cache (mtime mismatch): ${current.path}`);
        return true;
      }
    }

    if (currentMetadata.length !== entry.fileMetadata.length) {
      logger.debug("File count changed since cache");
      return true;
    }

    return false;
  }

  private async collectFileMetadata(paths: string[]): Promise<FileMetadata[]> {
    const metadata: FileMetadata[] = [];
    for (const p of paths) {
      try {
        const stat = await fs.stat(p);
        metadata.push({ path: p, mtime: stat.mtimeMs, size: stat.size });
      } catch {
        metadata.push({ path: p, mtime: 0, size: 0 });
      }
    }
    return metadata;
  }
}
