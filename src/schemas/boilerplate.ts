export const BOILERPLATE_SCHEMA = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          description: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    setup_instructions: { type: "array", items: { type: "string" } },
    dependencies_to_install: { type: "array", items: { type: "string" } },
  },
  required: ["files"],
};
