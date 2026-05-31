export const CODEBASE_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    architecture_overview: {
      type: "string",
      description: "2-4 sentence description of the codebase's overall architecture and purpose.",
    },
    tech_stack: {
      type: "array",
      items: { type: "string" },
      description: "List of frameworks, libraries, and tools detected.",
    },
    relevant_files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          relevance: { type: "string", description: "Why this file is relevant to the focus query." },
          key_exports: { type: "array", items: { type: "string" } },
        },
        required: ["path", "relevance"],
      },
      description: "Files most relevant to the focus_query, ranked by relevance.",
    },
    key_symbols: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["function", "class", "interface", "constant", "type"] },
          file: { type: "string" },
          description: { type: "string", description: "Factual description of what this symbol does." },
          signature: { type: "string", description: "Function/method signature if applicable." },
        },
        required: ["name", "type", "file", "description"],
      },
      description: "Key code symbols relevant to the focus query.",
    },
    entry_points: {
      type: "array",
      items: { type: "string" },
      description: "Main entry point files (index.ts, main.py, main.rs, etc.).",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Potential issues or uncertainties Gemini noticed during analysis.",
    },
  },
  required: ["architecture_overview", "tech_stack", "relevant_files", "key_symbols", "entry_points"],
};
