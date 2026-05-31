export const TEST_SUITE_SCHEMA = {
  type: "object",
  properties: {
    framework_detected: { type: "string" },
    test_file_content: { type: "string", description: "Complete, runnable test file content." },
    test_count: { type: "number" },
    coverage_areas: {
      type: "array",
      items: {
        type: "string",
        enum: ["happy_path", "edge_cases", "error_handling", "boundary_conditions", "integration", "mocking"],
      },
    },
    setup_requirements: {
      type: "array",
      items: { type: "string" },
      description: "Any setup steps required before running these tests.",
    },
  },
  required: ["test_file_content", "test_count", "coverage_areas"],
};
