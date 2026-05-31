import { describe, it, expect } from "vitest";
import { GracefulDegradationHandler } from "../src/degradation/handler.js";

const handler = new GracefulDegradationHandler();

describe("GracefulDegradationHandler", () => {
  it("classifies 401 as non-recoverable auth failure", () => {
    const result = handler.handle({ status: 401, message: "Unauthorized" });
    expect(result.status).toBe("GEMINI_UNAVAILABLE");
    expect(result.recoverable).toBe(false);
    expect(result.errorCode).toBe("401");
    expect(result.fallbackInstruction).toContain("authentication failed");
  });

  it("classifies 403 as non-recoverable auth failure", () => {
    const result = handler.handle({ status: 403, message: "Forbidden" });
    expect(result.recoverable).toBe(false);
    expect(result.errorCode).toBe("403");
  });

  it("classifies 404 as non-recoverable model not found", () => {
    const result = handler.handle({ status: 404, message: "Not Found" });
    expect(result.recoverable).toBe(false);
    expect(result.errorCode).toBe("404");
    expect(result.fallbackInstruction).toContain("model was not found");
  });

  it("classifies 429 as recoverable rate limit", () => {
    const result = handler.handle({ status: 429, message: "Rate Limited" });
    expect(result.recoverable).toBe(true);
    expect(result.errorCode).toBe("429");
    expect(result.fallbackInstruction).toContain("rate limit");
  });

  it("classifies 500 as recoverable server error", () => {
    const result = handler.handle({ status: 500, message: "Internal Server Error" });
    expect(result.recoverable).toBe(true);
    expect(result.errorCode).toBe("500");
  });

  it("classifies 503 as recoverable server error", () => {
    const result = handler.handle({ status: 503, message: "Service Unavailable" });
    expect(result.recoverable).toBe(true);
    expect(result.errorCode).toBe("503");
  });

  it("classifies unknown error as non-recoverable", () => {
    const result = handler.handle({ code: "ECONNREFUSED", message: "Connection refused" });
    expect(result.recoverable).toBe(false);
    expect(result.errorCode).toBe("ECONNREFUSED");
  });

  it("handles errors with no status or code", () => {
    const result = handler.handle(new Error("Something went wrong"));
    expect(result.status).toBe("GEMINI_UNAVAILABLE");
    expect(result.recoverable).toBe(false);
  });

  it("normalizes string status '429' to recoverable", () => {
    const result = handler.handle({ status: "429", message: "Rate Limited" });
    expect(result.recoverable).toBe(true);
    expect(result.errorCode).toBe("429");
  });

  it("normalizes string status '401' to non-recoverable", () => {
    const result = handler.handle({ status: "401", message: "Unauthorized" });
    expect(result.recoverable).toBe(false);
  });

  it("normalizes string status '503' to recoverable server error", () => {
    const result = handler.handle({ status: "503", message: "Service Unavailable" });
    expect(result.recoverable).toBe(true);
  });

  it("always returns GEMINI_UNAVAILABLE status field", () => {
    for (const code of [401, 403, 404, 429, 500, 503]) {
      const result = handler.handle({ status: code, message: "err" });
      expect(result.status).toBe("GEMINI_UNAVAILABLE");
    }
  });
});
