# gemini-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that offloads large-payload tasks from Claude Code to Google Gemini's 1,048,576-token context window, returning compact structured results that preserve Claude's context for actual reasoning and code generation.

> **Built for Claude Code power users** who work on large codebases and want to stop hitting context limits mid-task.

---

## The Problem

Claude Code's usable context window is approximately 120,000–160,000 tokens after system overhead, tool schemas, and conversation history. A single large codebase read can consume 20,000–80,000 tokens. On a complex feature, you'll hit the limit before you're done.

The typical workarounds — summarizing manually, restarting sessions, splitting tasks — all introduce friction and lose important context.

## The Solution

`gemini-mcp` acts as a preprocessing layer. When Claude Code needs to understand a large codebase, analyze logs, search code semantically, or review a diff, it delegates the heavy lifting to Gemini's 1M token window instead. Gemini processes the full payload and returns a structured 200–500 token summary. Claude uses that summary to reason — staying within budget for the parts that actually need Claude's intelligence.

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                            │
│  Developer prompt ──► Claude reasons ──► MCP tool call      │
│                                                │            │
│  200–500 token result injected ◄─ MCP response │            │
└───────────────────────────────────────────────┼────────────┘
                                                │ JSON-RPC/stdio
                                         ┌──────▼──────┐
                                         │  gemini-mcp  │
                                         │   (Node.js)  │
                                         │              │
                                         │  Cache (L1+L2)│
                                         │  Verifier    │
                                         │  Sanitizer   │
                                         └──────┬───────┘
                                                │
                                         ┌──────▼───────┐
                                         │  Gemini API  │
                                         │ (1M context) │
                                         └──────────────┘
```

---

## Benefits

### 1. Dramatic context window savings
Instead of reading a 500-file codebase directly into Claude's context (50,000+ tokens), you get a structured summary of the architecture, relevant files, and key symbols — typically 300–600 tokens. That's a **90–98% reduction** for codebase reads.

### 2. mtime-based caching with zero staleness
Results are cached by the modification timestamps of the input files, not by TTL. If you call `gemini_read_codebase` twice on the same unchanged code, the second call returns instantly from memory (L1 cache) or disk (L2 cache) — no Gemini API call, no tokens consumed, no waiting.

When you modify a file, the cache entry for that codebase is automatically invalidated. Caching is correct by construction, not by expiry guesswork.

### 3. Hallucination detection via structural verification
After Gemini produces a codebase summary, every identifier it mentions (function names, class names, file paths) is verified by actually grepping your local files. Identifiers that don't exist in the code are annotated `[UNVERIFIED]`. Web-sourced identifiers (from newer library docs) are annotated `[WEB_SOURCE]`. Claude Code knows immediately which claims to trust and which to verify.

### 4. Prompt injection protection
All Gemini output is sanitized before reaching Claude Code. Common injection patterns ("ignore previous instructions", persona-switching, `[INST]` tokens) are stripped and the content is wrapped in a reference-data framing block so Claude Code treats it as documentation, not instructions.

### 5. Conditional web search for post-cutoff libraries
When your `package.json` contains library versions released after Gemini's knowledge cutoff, the server automatically triggers a web search for that specific version's API docs before the analysis. You get accurate summaries even for bleeding-edge dependencies.

### 6. Graceful degradation
If Gemini is unavailable (rate limit, auth failure, model deprecation), Claude Code receives a structured error with a specific fallback instruction and fix suggestion — instead of a crash. The server tells Claude Code exactly what happened and how to recover.

### 7. Schema cost visibility
Call `gemini_context_cost` at any time to see how many tokens the MCP server's own tool schemas are consuming in Claude's context window. Keep overhead visible and in check.

---

## Tools

| Tool | What it does | Caches? |
|------|-------------|---------|
| `gemini_read_codebase` | Ingest an entire directory, return architecture summary and key symbols focused on your query | Yes |
| `gemini_grep_semantic` | Search code by intent ("where is rate limiting implemented") not just string matching | Yes |
| `gemini_shrink_logs` | Compress large build/test/server logs to only actionable errors and warnings | No |
| `gemini_summarize_diff` | Summarize a large Git diff into change categories, risks, and breaking changes | No |
| `gemini_review_code` | Security (OWASP), performance, and architecture review with structured findings | No |
| `gemini_generate_plan` | Generate a step-by-step implementation plan before writing code | No |
| `gemini_validate_approach` | Sanity-check an architectural decision — strengths, failure modes, alternatives | No |
| `gemini_write_tests` | Generate a complete test suite for a function or module | No |
| `gemini_write_boilerplate` | Generate scaffolding code that follows your existing patterns | No |
| `gemini_explain_error` | Root cause analysis for errors — not just "what" but "why" and how to fix | No |
| `gemini_context_cost` | Report the token cost of this server's own tool schemas | N/A |

---

## Who This Is For

**Primary audience: Claude Code power users working on substantial engineering tasks.**

You'll get the most value from `gemini-mcp` if you:

- Work on codebases with more than ~50 files
- Regularly run into Claude's context limit mid-task
- Use Claude Code for multi-file features, refactors, or debugging sessions that span many files
- Work with large log files, test output, or Git diffs
- Want code review or test generation without burning context on the analysis itself

**You probably don't need this if:**
- You primarily work on small, isolated files
- You only use Claude Code for short, contained tasks
- Context limits are not a pain point in your workflow

**Technical requirements:**
- [Claude Code](https://claude.ai/code) (any tier)
- Google AI Studio API key (free tier works for moderate volume; Gemini Pro subscription not required)
- Node.js >= 18

---

## Prerequisites

### 1. Get a Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Keep it handy for the configuration step

> **Note:** The Gemini Pro consumer subscription and the Gemini API are separate billing systems. This server uses the API (Google AI Studio), not the consumer subscription. The free tier provides 15 RPM / 1M TPM, which is sufficient for typical Claude Code sessions.

### 2. Install Claude Code

If you haven't already: [claude.ai/code](https://claude.ai/code)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/ParasJuneja/gemini-mcp.git
cd gemini-mcp

# Install dependencies
npm install

# Build
npm run build
```

### Register with Claude Code

```bash
claude mcp add gemini-mcp -s user -- env GEMINI_API_KEY=your_key_here node /absolute/path/to/gemini-mcp/dist/index.js
```

Replace `/absolute/path/to/gemini-mcp` with the actual absolute path where you cloned the repo.

**Restart Claude Code** after registering.

### Verify the installation

In Claude Code, type:

```
Call gemini_context_cost and tell me the schema overhead
```

You should see a report showing token costs per tool. If you see this, the server is working.

---

## Configuration

Copy `.env.example` to `.env` in the repo directory and set your values:

```bash
# Required
GEMINI_API_KEY=your_api_key_here

# Optional (defaults shown)
GEMINI_MODEL=gemini-3.1-pro-preview      # Gemini model to use
GEMINI_MAX_OUTPUT_TOKENS=65536           # Max tokens per Gemini response
CACHE_DIR=/absolute/path/to/gemini-mcp/cache  # Use absolute path
CACHE_MAX_AGE_MS=86400000               # Cache max age: 24 hours
LOG_LEVEL=info                          # debug | info | warn | error
SCHEMA_COST_WARN_THRESHOLD=5000         # Log warning if schema cost exceeds this
```

> **Important:** When registering with Claude Code, set the env vars directly in the `claude mcp add` command (as shown above) or in `~/.claude/settings.json`. The `.env` file is read by the server process if you run it directly, but the recommended approach is via Claude Code's MCP configuration.

---

## Usage Examples

### Understand a large codebase

```
Use gemini_read_codebase with paths: ["./src"] and focus_query: "authentication and session management flow"
```

Returns a structured summary of the relevant files, key functions, and architecture — without reading every file into Claude's context.

### Find where something is implemented

```
Use gemini_grep_semantic with query: "where are database connection pools initialized and managed" and paths: ["./src", "./lib"]
```

Finds the relevant code even if it doesn't contain those exact words.

### Compress a large log

```
Use gemini_shrink_logs with log_content: <paste your CI log here> and log_type: "build"
```

Returns only the actionable errors and warnings, with file locations and suggested fixes.

### Review code before committing

```
Use gemini_review_code with code: <paste your diff or function> and language: "typescript" and focus: ["security", "performance"]
```

Returns structured findings with OWASP categories for security issues.

---

## Conditions of Use

### API costs
- **Gemini API**: You are responsible for your own Google AI Studio API usage and any associated costs. The free tier (15 RPM, 1M TPM) is sufficient for most Claude Code sessions. Heavy continuous use may require upgrading to a paid tier.
- **Claude Code**: Your normal Claude subscription applies. This server reduces Claude's token consumption, it does not eliminate it.

### Privacy
- **Your code is sent to Google**: When you call `gemini_read_codebase`, `gemini_grep_semantic`, or any tool that reads files, the contents of those files are sent to the Gemini API. Do not use this server with code that contains secrets, credentials, proprietary algorithms, or anything subject to confidentiality agreements that prohibit sending to third-party AI services.
- **Log data**: `gemini_shrink_logs` sends your log content to Gemini. Redact sensitive values (tokens, passwords, internal hostnames) before using this tool.

### Accuracy
- Gemini's responses are verified for identifier accuracy (the structural verifier greps your local files), but semantic correctness is not guaranteed. Always review summaries before acting on them.
- Identifiers marked `[UNVERIFIED]` were not found in your local codebase — do not use them without checking.
- Identifiers marked `[WEB_SOURCE]` came from web search — they may not be in your current local version of a library.

### Local use only
This server is designed for single-developer local use. It is not designed for multi-tenant or shared deployments and does not implement access controls, rate limiting, or audit logging appropriate for shared infrastructure.

---

## Architecture

The server is built in TypeScript and runs as a local process communicating with Claude Code over stdio JSON-RPC (the standard MCP transport). All logging goes to stderr — stdout is reserved for the MCP protocol.

**Key components:**

- **`GeminiClient`** — Wraps the Gemini API with retry logic (exponential backoff on 429/5xx), structured output enforcement, and optional web search tool attachment.
- **`CacheManager`** — Two-layer cache: in-memory L1 Map (zero-latency hits within a session) backed by disk L2 JSON files (survives restarts). Invalidation is mtime-based, not TTL-based.
- **`StructuralVerifier`** — Extracts camelCase, PascalCase, snake_case identifiers and file paths from Gemini's output, greps your local files to verify they exist, and annotates unverified ones.
- **`OutputSanitizer`** — Strips known prompt injection patterns from Gemini output using stateless regex application and wraps the result in a reference-data framing block.
- **`WebSearchTrigger`** — Detects post-cutoff library versions in `package.json` / `pyproject.toml` / `Cargo.toml` and conditionally attaches Google Search to the Gemini call.
- **`GracefulDegradationHandler`** — Maps Gemini API errors to structured fallback instructions with specific recovery steps.

See [`gemini-mcp-implementation-plan.md`](gemini-mcp-implementation-plan.md) for the full architecture specification.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where contributions are especially valuable:

- **Expanding `POST_CUTOFF_SIGNALS`** in `src/search/version-detector.ts` — add new major framework versions as they release
- **Python and Rust version detection** — `estimatePypiReleaseDate` and `estimateCratesReleaseDate` are currently stubs
- **New tools** — proposals welcome; open an issue first to discuss fit and schema
- **Performance improvements** — particularly the file-reading step in `StructuralVerifier`
- **Bug reports and test improvements**

---

## Development

```bash
npm run build      # Compile TypeScript
npm test           # Run all tests (vitest)
npm run test:watch # Watch mode
```

All 82 tests must pass before submitting a PR. The CI will enforce this.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
