export const ERROR_EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    error_type: { type: "string" },
    root_cause: { type: "string" },
    explanation: { type: "string" },
    fix: {
      type: "object",
      properties: {
        description: { type: "string" },
        code_example: { type: "string" },
      },
      required: ["description"],
    },
    related_documentation: { type: "array", items: { type: "string" } },
    similar_errors: { type: "array", items: { type: "string" } },
  },
  required: ["error_type", "root_cause", "explanation", "fix"],
};
