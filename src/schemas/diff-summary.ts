export const DIFF_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    files_changed: { type: "number" },
    additions: { type: "number" },
    deletions: { type: "number" },
    change_categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["feature", "bugfix", "refactor", "test", "config", "docs", "dependency"] },
          description: { type: "string" },
          affected_files: { type: "array", items: { type: "string" } },
        },
        required: ["category", "description"],
      },
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description: "Potential risks or concerns introduced by this diff.",
    },
    breaking_changes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary", "files_changed", "change_categories"],
};
