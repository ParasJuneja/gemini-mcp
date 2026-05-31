export const CODE_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    overall_assessment: {
      type: "string",
      enum: ["approved", "approved_with_suggestions", "changes_requested", "critical_issues"],
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          category: {
            type: "string",
            enum: [
              "security_injection", "security_auth", "security_crypto", "security_exposure",
              "security_other", "performance_algorithm", "performance_memory", "performance_io",
              "architecture_coupling", "architecture_pattern", "maintainability", "correctness", "other",
            ],
          },
          description: { type: "string" },
          line_reference: { type: "string" },
          suggested_fix: { type: "string" },
          owasp_category: {
            type: "string",
            description: "OWASP Top 10 category if applicable. Example: A01:2021-Broken Access Control",
          },
        },
        required: ["severity", "category", "description"],
      },
    },
    positive_observations: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["overall_assessment", "findings"],
};
