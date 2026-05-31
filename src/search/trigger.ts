import { GeminiClient } from "../client/gemini.js";
import { detectVersionSignals } from "./version-detector.js";
import { logger } from "../utils/logger.js";

export interface WebSearchContext {
  shouldSearch: boolean;
  searchQueries: string[];
  triggerReasons: string[];
}

export class WebSearchTrigger {
  private readonly geminiClient: GeminiClient;

  // Gemini knowledge cutoff
  private readonly KNOWLEDGE_CUTOFF = new Date("2026-02-01");

  constructor(geminiClient: GeminiClient) {
    this.geminiClient = geminiClient;
  }

  async analyze(fileContents: Map<string, string>): Promise<WebSearchContext> {
    const signals = detectVersionSignals(fileContents);
    const postCutoffSignals = signals.filter(
      (s) => s.estimatedReleaseDate > this.KNOWLEDGE_CUTOFF
    );

    if (postCutoffSignals.length === 0) {
      logger.debug("No post-cutoff version signals detected. Skipping web search.");
      return { shouldSearch: false, searchQueries: [], triggerReasons: [] };
    }

    const queries = postCutoffSignals.map(
      (s) => `${s.packageName} ${s.version} API documentation changelog`
    );

    const reasons = postCutoffSignals.map(
      (s) => `${s.packageName}@${s.version} detected (post-cutoff: ${s.estimatedReleaseDate.toISOString().split("T")[0]})`
    );

    logger.info(`Web search triggered for ${postCutoffSignals.length} post-cutoff packages: ${reasons.join(", ")}`);

    return {
      shouldSearch: true,
      searchQueries: queries,
      triggerReasons: reasons,
    };
  }
}
