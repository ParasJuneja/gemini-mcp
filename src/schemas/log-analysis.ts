export const LOG_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    error_count: { type: "number" },
    warning_count: { type: "number" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["error", "warning", "info"] },
          category: { type: "string" },
          message: { type: "string" },
          file: { type: "string" },
          line: { type: "number" },
          suggested_fix: { type: "string" },
        },
        required: ["severity", "message"],
      },
    },
    summary: { type: "string" },
    root_cause: { type: "string" },
  },
  required: ["error_count", "warning_count", "issues", "summary"],
};
