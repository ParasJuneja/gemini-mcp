export const APPROACH_VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["sound", "sound_with_caveats", "risky", "not_recommended"] },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    failure_modes: { type: "array", items: { type: "string" } },
    better_alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          approach: { type: "string" },
          advantage: { type: "string" },
        },
        required: ["approach", "advantage"],
      },
    },
    recommendation: { type: "string" },
  },
  required: ["verdict", "strengths", "weaknesses", "recommendation"],
};
