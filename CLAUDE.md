# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Model Context Protocol (MCP) server** that acts as a preprocessing layer between Claude Code and Google's Gemini API. Its sole purpose is to reduce Claude Code's context window consumption by offloading large-payload tasks (codebase ingestion, log analysis, semantic search, code review) to Gemini's 1M token context window, then returning compressed, structured results (~200–500 tokens) back to Claude Code.

**The repository is currently pre-implementation.** The authoritative spec is [`gemini-mcp-implementation-plan.md`](gemini-mcp-implementation-plan.md). Read that document in full before writing any code — every architectural decision is captured there and should not be revisited.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
```

After building, install into Claude Code:
```bash
claude mcp add gemini-mcp -s user -- env GEMINI_API_KEY=your_key node /absolute/path/to/dist/index.js
```

Verify installation in Claude Code by calling `gemini_context_cost`.

## Environment

Copy `.env.example` to `.env` and set:
- `GEMINI_API_KEY` — required; from https://aistudio.google.com/app/apikey
- `GEMINI_MODEL` — defaults to `gemini-3.1-pro-preview`
- `CACHE_DIR` — use absolute path; defaults to `./cache`
- `LOG_LEVEL` — `debug | info | warn | error`

## Architecture

The MCP server runs via **stdio JSON-RPC transport** (never HTTP). All logging goes to **stderr** — stdout is reserved for MCP JSON-RPC messages.

### Dependency injection pattern

All core systems are instantiated in `src/index.ts` and passed as a `ToolDependencies` bundle to every tool handler. Tools never instantiate their own dependencies:

```
GeminiClient → CacheManager → StructuralVerifier → OutputSanitizer
WebSearchTrigger → SchemaCostMonitor → GracefulDegradationHandler
```

### Request pipeline (for codebase tools)

1. Check L1 (in-memory) cache → return immediately on hit
2. Check L2 (disk) cache at `cache/<sha1hash>.json` → return on hit, warm L1
3. Read files from disk via `file-reader.ts` (respects `.gitignore`)
4. Run `WebSearchTrigger.analyze()` — conditional, only when post-cutoff library versions detected in `package.json` / `pyproject.toml` / `Cargo.toml`
5. Call Gemini with structured output schema (`responseMimeType: "application/json"`)
6. Run `StructuralVerifier` — greps actual files to catch hallucinated identifiers; marks them `[UNVERIFIED]`; web-sourced identifiers get `[WEB_SOURCE]` instead
7. Run `OutputSanitizer` — strips injection patterns, wraps in framing block
8. Write to both cache layers

Tools that operate on ephemeral data (logs, diffs) skip caching entirely.

### Cache invalidation

**mtime-based, not TTL-based.** A cache entry is stale if any covered file has been modified since the entry was created. The `projectHash` (SHA-1 over sorted paths + focus query) is the cache key — stored as `cache/<hash>.json`.

### Web search

Web search is **conditional**, not universal. It fires only when `version-detector.ts` detects dependency versions that might post-date Gemini's knowledge cutoff (February 2026). The `POST_CUTOFF_SIGNALS` map in `src/search/version-detector.ts` is the primary maintenance surface — extend it when new major framework versions release.

### Graceful degradation

Every Gemini API error is caught by `GracefulDegradationHandler`, which returns a structured `GEMINI_UNAVAILABLE` response telling Claude Code to fall back to native file tools. 401/403/404 are non-retryable; 429/5xx retry with exponential backoff (max 3 attempts, 1s/2s/4s delays).

## Tools Exposed to Claude Code

| Tool | Purpose | Caches? |
|------|---------|---------|
| `gemini_read_codebase` | Ingest entire directory, return structured summary | Yes |
| `gemini_grep_semantic` | Semantic code search (intent-based, not string-match) | Yes |
| `gemini_shrink_logs` | Compress build/test/server logs to actionable errors | No |
| `gemini_summarize_diff` | Summarize large Git diffs | No |
| `gemini_review_code` | Security/performance/architecture review | No |
| `gemini_generate_plan` | Implementation plan before coding | No |
| `gemini_validate_approach` | Sanity-check architectural decisions | No |
| `gemini_write_tests` | Generate comprehensive test suites | No |
| `gemini_write_boilerplate` | Generate scaffolding code | No |
| `gemini_explain_error` | Root cause analysis for errors | No |
| `gemini_context_cost` | Report schema token overhead (no Gemini call) | N/A |

## Implementation Order

The spec defines a strict build order (Section 16). Follow it:

1. **Phase 1 — Foundation:** `constants.ts`, `logger.ts`, `token-estimator.ts`, `file-reader.ts`, `gemini.ts`, `cache/hash.ts`, `cache/store.ts`, `cache/manager.ts`
2. **Phase 2 — Safety layer:** `verifier.ts`, `sanitizer.ts`, `degradation/handler.ts`
3. **Phase 3 — Search:** `version-detector.ts`, `search/trigger.ts`
4. **Phase 4 — Schemas and prompts:** all files in `src/schemas/` and `src/prompts/`
5. **Phase 5 — Tools:** start with `context-cost.ts` (no API call), then `shrink-logs.ts`, then the rest; `read-codebase.ts` last
6. **Phase 6 — Wiring:** `types.ts`, `server.ts`, `index.ts`
7. **Phase 7 — Integration tests and MCP config**

## Key Constraints

- **Model is always `gemini-3.1-pro-preview`** — no routing to Flash, no model switching
- **Temperature is always 0** for all Gemini calls (deterministic/factual)
- **Structured output required** for every call — `responseMimeType: "application/json"` with `responseSchema`
- **Stdout is reserved** for MCP JSON-RPC — all logging uses `logger.ts` which writes to stderr
- **TypeScript strict mode** — `tsconfig.json` has `"strict": true`; no `any` except where the Gemini SDK forces it
- **Zod validates** all structured outputs from Gemini before returning to Claude Code
