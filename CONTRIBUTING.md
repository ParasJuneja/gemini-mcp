# Contributing to gemini-mcp

Thank you for considering a contribution. This project follows a standard PR-based workflow — all changes require a pull request and at least one approval before merging.

---

## Getting started

```bash
git clone https://github.com/ParasJuneja/gemini-mcp.git
cd gemini-mcp
npm install
npm run build
npm test        # All 82 tests must pass
```

---

## How to contribute

1. **Open an issue first** for anything beyond a typo fix or obvious bug — especially new tools, architectural changes, or behaviour changes. This prevents wasted effort if the direction doesn't fit the project.

2. **Fork the repo** and create a branch from `main`:
   ```bash
   git checkout -b your-feature-name
   ```

3. **Write tests** for any new behaviour. The project uses [vitest](https://vitest.dev). PRs without test coverage for new code will be asked to add it.

4. **Run the full test suite** before pushing:
   ```bash
   npm run build && npm test
   ```
   All tests must pass. Do not submit a PR with failing tests.

5. **Open a pull request** against `main`. Fill in the PR template — the description field is not optional.

---

## What we especially want

- **`POST_CUTOFF_SIGNALS` updates** (`src/search/version-detector.ts`): When a major framework releases a version post-dating Gemini's knowledge cutoff, add it to the map. Include a comment linking to the release announcement.

- **Python/Rust version detection**: `estimatePypiReleaseDate` and `estimateCratesReleaseDate` in `src/search/version-detector.ts` are currently stubs that return `null`. Implementing real version-to-date heuristics for popular Python/Rust packages is a valuable contribution.

- **New tools**: Must follow the existing tool pattern (`{ name, description, inputSchema, handler }`), include a JSON Schema for structured output, include a system prompt, and include tests. Open an issue first to agree on the tool's scope and schema.

- **Verifier performance**: `StructuralVerifier.grepFiles` currently reads each file from disk once per identifier. Caching file contents in memory for the duration of a single `verify()` call would reduce disk I/O significantly.

- **Bug reports**: Open an issue with a minimal reproduction case and the exact error output.

---

## Code style

- TypeScript strict mode — no `any` except where the Gemini SDK's types require it
- All relative imports use `.js` extensions (required for CommonJS output compatibility)
- All logging via `logger` from `src/utils/logger.ts` — never `console.log` (stdout is reserved for the MCP JSON-RPC protocol)
- No comments unless the WHY is genuinely non-obvious. Do not comment what the code does.

---

## Review process

- All PRs require at least **one approving review** from a maintainer before merge
- PRs that break existing tests will not be merged
- The PR description must explain what changed and why — not just what the diff shows
- Maintainers may ask for changes; this is normal and not a rejection

---

## Reporting security issues

Do not open a public issue for security vulnerabilities. Email directly: parasjnj98@gmail.com

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
