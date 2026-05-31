// src/types.ts — TEMPORARY placeholder; Phase 6 will fill this in completely
import type { GeminiClient } from "./client/gemini.js";
import type { CacheManager } from "./cache/manager.js";
import type { StructuralVerifier } from "./verification/verifier.js";
import type { OutputSanitizer } from "./sanitization/sanitizer.js";
import type { WebSearchTrigger } from "./search/trigger.js";
import type { GracefulDegradationHandler } from "./degradation/handler.js";

// SchemaCostMonitor placeholder — real one comes in Phase 6
export interface SchemaCostMonitor {
  generateReport(): unknown;
  register(name: string, description: string, schema: object): void;
}

export interface ToolDependencies {
  geminiClient: GeminiClient;
  cacheManager: CacheManager;
  verifier: StructuralVerifier;
  sanitizer: OutputSanitizer;
  webSearchTrigger: WebSearchTrigger;
  schemaCostMonitor: SchemaCostMonitor;
  degradationHandler: GracefulDegradationHandler;
}
