export interface VersionSignal {
  packageName: string;
  version: string;
  source: string;                  // Which file it was found in
  estimatedReleaseDate: Date;      // Best estimate of when this version was released
}

/**
 * Detects library version signals in project files.
 * Supports: package.json, pyproject.toml, requirements.txt, Cargo.toml
 */
export function detectVersionSignals(
  fileContents: Map<string, string>
): VersionSignal[] {
  const signals: VersionSignal[] = [];

  for (const [filePath, content] of fileContents) {
    const fileName = filePath.split("/").pop() ?? "";

    if (fileName === "package.json") {
      signals.push(...parsePackageJson(content, filePath));
    } else if (fileName === "pyproject.toml" || fileName === "requirements.txt") {
      signals.push(...parsePythonDeps(content, filePath));
    } else if (fileName === "Cargo.toml") {
      signals.push(...parseCargoToml(content, filePath));
    }
  }

  return signals;
}

function parsePackageJson(content: string, source: string): VersionSignal[] {
  const signals: VersionSignal[] = [];
  try {
    const pkg = JSON.parse(content);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };

    for (const [name, versionSpec] of Object.entries(allDeps ?? {})) {
      const version = String(versionSpec).replace(/^[^0-9]*/, "");
      const estimatedDate = estimateNpmReleaseDate(name, version);
      if (estimatedDate) {
        signals.push({ packageName: name, version, source, estimatedReleaseDate: estimatedDate });
      }
    }
  } catch {
    // Invalid JSON — skip
  }
  return signals;
}

function parsePythonDeps(content: string, source: string): VersionSignal[] {
  const signals: VersionSignal[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9_-]+)[>=<~!]+([0-9.]+)/);
    if (match) {
      const [, name, version] = match;
      const estimatedDate = estimatePypiReleaseDate(name, version);
      if (estimatedDate) {
        signals.push({ packageName: name, version, source, estimatedReleaseDate: estimatedDate });
      }
    }
  }
  return signals;
}

function parseCargoToml(content: string, source: string): VersionSignal[] {
  const signals: VersionSignal[] = [];
  const matches = content.matchAll(/^\s*([a-zA-Z0-9_-]+)\s*=\s*"([0-9.]+)"/gm);
  for (const [, name, version] of matches) {
    const estimatedDate = estimateCratesReleaseDate(name, version);
    if (estimatedDate) {
      signals.push({ packageName: name, version, source, estimatedReleaseDate: estimatedDate });
    }
  }
  return signals;
}

/**
 * Maps known major version bumps to approximate post-cutoff dates.
 * Returns null if the version is clearly pre-cutoff.
 * Gemini knowledge cutoff is February 2026. Flag anything that might be post-Jan 2026.
 */
const POST_CUTOFF_SIGNALS: Record<string, string> = {
  "react": "20",
  "next": "16",
  "vue": "4",
  "angular": "20",
  "typescript": "5.9",
  "vite": "7",
  "tailwindcss": "4.1",
  "prisma": "7",
  "drizzle-orm": "1",
  "trpc": "12",
};

function estimateNpmReleaseDate(name: string, version: string): Date | null {
  const threshold = POST_CUTOFF_SIGNALS[name];
  if (!threshold) return null;

  const majorVersion = parseInt(version.split(".")[0]);
  const thresholdMajor = parseInt(threshold.split(".")[0]);
  const thresholdMinor = threshold.includes(".") ? parseInt(threshold.split(".")[1]) : 0;
  const versionMinor = version.includes(".") ? parseInt(version.split(".")[1]) : 0;

  const exceedsMajor = majorVersion > thresholdMajor;
  const meetsMajorWithMinor = majorVersion === thresholdMajor && versionMinor >= thresholdMinor;

  if (exceedsMajor || meetsMajorWithMinor) {
    return new Date("2026-02-15");
  }

  return null;
}

// Python and Rust — return null for now; extend as major frameworks release post-cutoff versions
function estimatePypiReleaseDate(_name: string, _version: string): Date | null {
  return null;
}

function estimateCratesReleaseDate(_name: string, _version: string): Date | null {
  return null;
}
