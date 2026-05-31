export interface DegradationResponse {
  status: "GEMINI_UNAVAILABLE";
  errorCode: string;
  errorMessage: string;
  recoverable: boolean;
  fallbackInstruction: string;
  fixSuggestion: string;
}

export class GracefulDegradationHandler {
  handle(err: unknown): DegradationResponse {
    const error = err as Record<string, unknown>;
    const status = error?.status ?? error?.code ?? "UNKNOWN";
    const message = (error?.message as string) ?? String(err);

    if (status === 401 || status === 403) {
      return {
        status: "GEMINI_UNAVAILABLE",
        errorCode: String(status),
        errorMessage: message,
        recoverable: false,
        fallbackInstruction:
          "Gemini API authentication failed. Read files directly using your native file tools. " +
          "Do not retry Gemini tools until the API key is fixed.",
        fixSuggestion:
          "Check GEMINI_API_KEY in your .env file. Regenerate at https://aistudio.google.com/app/apikey",
      };
    }

    if (status === 404) {
      return {
        status: "GEMINI_UNAVAILABLE",
        errorCode: "404",
        errorMessage: message,
        recoverable: false,
        fallbackInstruction:
          "The configured Gemini model was not found. This likely means the model was deprecated. " +
          "Read files directly using your native file tools for now.",
        fixSuggestion:
          "Update GEMINI_MODEL in .env to the latest model. Check https://ai.google.dev/gemini-api/docs/models for current model names. " +
          "Then run 'npm update' in the gemini-mcp directory and restart.",
      };
    }

    if (status === 429) {
      return {
        status: "GEMINI_UNAVAILABLE",
        errorCode: "429",
        errorMessage: message,
        recoverable: true,
        fallbackInstruction:
          "Gemini API rate limit hit after maximum retries. " +
          "Read files directly for this task. Gemini tools will recover automatically.",
        fixSuggestion:
          "Rate limit will reset within 60 seconds. " +
          "If hitting limits frequently, consider Vertex AI with higher quotas.",
      };
    }

    if (typeof status === "number" && status >= 500) {
      return {
        status: "GEMINI_UNAVAILABLE",
        errorCode: String(status),
        errorMessage: message,
        recoverable: true,
        fallbackInstruction:
          "Gemini API is experiencing a server error. Read files directly for this task.",
        fixSuggestion:
          "Check Google AI status at https://status.cloud.google.com. Usually resolves within minutes.",
      };
    }

    return {
      status: "GEMINI_UNAVAILABLE",
      errorCode: String(status),
      errorMessage: message,
      recoverable: false,
      fallbackInstruction:
        "An unexpected error occurred with the Gemini API. Read files directly for this task.",
      fixSuggestion:
        "Check the MCP server logs for details. Restart the MCP server and try again.",
    };
  }
}
