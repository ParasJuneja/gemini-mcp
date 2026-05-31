import { logger } from "../utils/logger.js";
import { SCHEMA_COST_WARN_THRESHOLD } from "../utils/constants.js";
import { estimateTokens } from "../utils/token-estimator.js";

export interface SchemaCostReport {
  totalEstimatedTokens: number;
  perToolBreakdown: Array<{
    toolName: string;
    estimatedTokens: number;
    descriptionLength: number;
    schemaComplexity: number;
  }>;
  warningThreshold: number;
  exceedsThreshold: boolean;
  recommendation: string;
}

export class SchemaCostMonitor {
  private readonly toolSchemas: Map<string, { description: string; schema: object }> = new Map();

  register(toolName: string, description: string, schema: object): void {
    this.toolSchemas.set(toolName, { description, schema });
  }

  generateReport(): SchemaCostReport {
    const breakdown = [];
    let total = 0;

    for (const [toolName, { description, schema }] of this.toolSchemas) {
      const schemaStr = JSON.stringify(schema);
      const descTokens = estimateTokens(description);
      const schemaTokens = estimateTokens(schemaStr);
      const nameTokens = estimateTokens(toolName);
      const toolTotal = descTokens + schemaTokens + nameTokens;
      total += toolTotal;

      breakdown.push({
        toolName,
        estimatedTokens: toolTotal,
        descriptionLength: description.length,
        schemaComplexity: Object.keys(schema).length,
      });
    }

    const threshold = Number(process.env.SCHEMA_COST_WARN_THRESHOLD ?? SCHEMA_COST_WARN_THRESHOLD);
    const exceeds = total > threshold;

    if (exceeds) {
      logger.warn(
        `Schema cost (${total} tokens) exceeds warning threshold (${threshold}). ` +
        `Consider consolidating verbose tool descriptions.`
      );
    }

    let recommendation = "Schema cost is within acceptable range.";
    if (total > 10000) {
      recommendation = "Schema cost is high (>10K tokens). Review tool descriptions for verbosity.";
    } else if (total > 5000) {
      recommendation = "Schema cost is moderate (>5K tokens). Monitor as more tools are added.";
    }

    return {
      totalEstimatedTokens: total,
      perToolBreakdown: breakdown.sort((a, b) => b.estimatedTokens - a.estimatedTokens),
      warningThreshold: threshold,
      exceedsThreshold: exceeds,
      recommendation,
    };
  }
}
