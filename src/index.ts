import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";
import { GeminiClient } from "./client/gemini.js";
import { CacheManager } from "./cache/manager.js";
import { StructuralVerifier } from "./verification/verifier.js";
import { OutputSanitizer } from "./sanitization/sanitizer.js";
import { WebSearchTrigger } from "./search/trigger.js";
import { SchemaCostMonitor } from "./monitoring/schema-cost.js";
import { GracefulDegradationHandler } from "./degradation/handler.js";
import { registerAllTools } from "./server.js";
import { logger } from "./utils/logger.js";

dotenv.config();

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    logger.error("GEMINI_API_KEY is not set. Exiting.");
    process.exit(1);
  }

  const geminiClient = new GeminiClient(process.env.GEMINI_API_KEY);
  const cacheManager = new CacheManager();
  const verifier = new StructuralVerifier();
  const sanitizer = new OutputSanitizer();
  const webSearchTrigger = new WebSearchTrigger(geminiClient);
  const schemaCostMonitor = new SchemaCostMonitor();
  const degradationHandler = new GracefulDegradationHandler();

  const server = new Server(
    { name: "gemini-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  registerAllTools(server, {
    geminiClient,
    cacheManager,
    verifier,
    sanitizer,
    webSearchTrigger,
    schemaCostMonitor,
    degradationHandler,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`Gemini MCP server started. Model: ${process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview"}`);
  logger.info(`Cache directory: ${process.env.CACHE_DIR ?? "./cache"}`);
}

main().catch((err) => {
  logger.error("Fatal error during startup:", err);
  process.exit(1);
});
