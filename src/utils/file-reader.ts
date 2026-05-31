import * as fs from "fs/promises";
import * as path from "path";
import ignore, { Ignore } from "ignore";
import { DEFAULT_EXCLUDE_PATTERNS, FILE_READ_MAX_SIZE_BYTES } from "./constants.js";

export interface FileContent {
  path: string;
  content: string;
}

async function loadGitignore(dir: string): Promise<Ignore> {
  const ig = ignore();
  try {
    const gitignorePath = path.join(dir, ".gitignore");
    const content = await fs.readFile(gitignorePath, "utf-8");
    ig.add(content);
  } catch {
    // No .gitignore present, ignore the error
  }
  return ig;
}

async function collectFiles(
  dirPath: string,
  rootDir: string,
  ig: Ignore,
  extraIg: Ignore
): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootDir, fullPath);

    // Check against gitignore and extra patterns
    if (ig.ignores(relativePath) || extraIg.ignores(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, rootDir, ig, extraIg);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

export async function readFiles(
  paths: string[],
  excludePatterns?: string[]
): Promise<FileContent[]> {
  const defaultIg = ignore().add(DEFAULT_EXCLUDE_PATTERNS);
  const extraIg = ignore();
  if (excludePatterns && excludePatterns.length > 0) {
    extraIg.add(excludePatterns);
  }

  const allFilePaths: string[] = [];

  for (const inputPath of paths) {
    const resolvedPath = path.resolve(inputPath);
    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      continue;
    }

    if (stat.isFile()) {
      allFilePaths.push(resolvedPath);
    } else if (stat.isDirectory()) {
      const rootDir = resolvedPath;
      const dirIg = await loadGitignore(rootDir);
      dirIg.add(DEFAULT_EXCLUDE_PATTERNS);
      if (excludePatterns && excludePatterns.length > 0) {
        dirIg.add(excludePatterns);
      }
      const files = await collectFiles(rootDir, rootDir, dirIg, extraIg);
      allFilePaths.push(...files);
    }
  }

  const results: FileContent[] = [];

  for (const filePath of allFilePaths) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > FILE_READ_MAX_SIZE_BYTES) {
        continue;
      }
      const content = await fs.readFile(filePath, "utf-8");
      results.push({ path: filePath, content });
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}
