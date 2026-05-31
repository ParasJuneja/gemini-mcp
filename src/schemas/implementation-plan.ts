export const IMPLEMENTATION_PLAN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    estimated_complexity: { type: "string", enum: ["trivial", "simple", "moderate", "complex", "very_complex"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step_number: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          files_to_modify: { type: "array", items: { type: "string" } },
          files_to_create: { type: "array", items: { type: "string" } },
          estimated_effort: { type: "string", enum: ["minutes", "hours", "days"] },
          dependencies: { type: "array", items: { type: "number" }, description: "Step numbers this step depends on." },
          risks: { type: "array", items: { type: "string" } },
        },
        required: ["step_number", "title", "description"],
      },
    },
    testing_strategy: { type: "string" },
    potential_blockers: { type: "array", items: { type: "string" } },
    alternatives_considered: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "estimated_complexity", "steps"],
};
