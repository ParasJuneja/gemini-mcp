import {
  GoogleGenerativeAI,
  GenerativeModel,
} from "@google/generative-ai";
import { logger } from "../utils/logger.js";
import { GEMINI_MODEL, GEMINI_MAX_OUTPUT_TOKENS, MAX_RETRIES, BASE_RETRY_DELAY_MS } from "../utils/constants.js";

export interface GeminiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  responseSchema?: object;
  useWebSearch?: boolean;
  temperature?: number;
}

export interface GeminiResponse {
  content: unknown;
  rawText: string;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = process.env.GEMINI_MODEL ?? GEMINI_MODEL;
  }

  async call(options: GeminiCallOptions): Promise<GeminiResponse> {
    const modelConfig: Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0] = {
      model: this.modelName,
      systemInstruction: options.systemPrompt,
      generationConfig: {
        temperature: options.temperature ?? 0,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        ...(options.responseSchema
          ? {
              responseMimeType: "application/json",
              responseSchema: options.responseSchema as any,
            }
          : {}),
      },
    };

    if (options.useWebSearch) {
      modelConfig.tools = [{ googleSearch: {} } as any];
    }

    const model: GenerativeModel = this.genAI.getGenerativeModel(modelConfig);
    return this.callWithRetry(model, options.userPrompt);
  }

  private async callWithRetry(
    model: GenerativeModel,
    prompt: string,
    attempt = 0
  ): Promise<GeminiResponse> {
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const rawText = response.text();

      let content: unknown;
      try {
        content = JSON.parse(rawText);
      } catch {
        logger.warn("Gemini returned non-JSON response. Wrapping as error.");
        content = { _parse_error: true, raw: rawText };
      }

      return {
        content,
        rawText,
        usageMetadata: response.usageMetadata
          ? {
              promptTokenCount: response.usageMetadata.promptTokenCount ?? 0,
              candidatesTokenCount: response.usageMetadata.candidatesTokenCount ?? 0,
              totalTokenCount: response.usageMetadata.totalTokenCount ?? 0,
            }
          : undefined,
      };
    } catch (err: unknown) {
      if (attempt >= MAX_RETRIES) {
        logger.error(`Gemini call failed after ${MAX_RETRIES} retries.`, err);
        throw err;
      }

      const status = (err as any)?.status ?? (err as any)?.code;

      if (status === 429 || status === 503 || status === 502) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`Gemini API error (${status}). Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return this.callWithRetry(model, prompt, attempt + 1);
      }

      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
