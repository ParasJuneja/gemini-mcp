export const GEMINI_MODEL = "gemini-1.5-pro"; // default for API-key (free-tier) mode
export const GEMINI_MODEL_OAUTH = "gemini-2.5-pro"; // default for OAuth (Gemini subscription) mode
export const GEMINI_MAX_OUTPUT_TOKENS = 65536;
export const MAX_RETRIES = 3;
export const BASE_RETRY_DELAY_MS = 1000;
export const CACHE_DIR = "./cache";
export const CACHE_MAX_AGE_MS = 86400000; // 24 hours
export const SCHEMA_COST_WARN_THRESHOLD = 5000; // tokens
export const DEFAULT_MAX_SEMANTIC_RESULTS = 10;
export const FILE_READ_MAX_SIZE_BYTES = 10_000_000; // 10MB per file
export const DEFAULT_EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "*.lock",
  "*.log",
  "*.min.js",
  "*.min.css",
  "coverage",
  "__pycache__",
  "*.pyc",
  ".env",
  ".env.*",
];
