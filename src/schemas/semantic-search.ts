export const SEMANTIC_SEARCH_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          relevance_score: { type: "number", description: "0.0 to 1.0" },
          explanation: { type: "string" },
          line_range: {
            type: "object",
            properties: {
              start: { type: "number" },
              end: { type: "number" },
            },
          },
          snippet: { type: "string", description: "The most relevant code snippet from this file." },
        },
        required: ["file_path", "relevance_score", "explanation"],
      },
    },
    query_interpretation: {
      type: "string",
      description: "How Gemini interpreted the search query.",
    },
  },
  required: ["results", "query_interpretation"],
};
