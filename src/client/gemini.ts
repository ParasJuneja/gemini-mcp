import {
  GoogleGenerativeAI,
  GenerativeModel,
} from "@google/generative-ai";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logger } from "../utils/logger.js";
import {
  GEMINI_MODEL,
  GEMINI_MODEL_OAUTH,
  GEMINI_MAX_OUTPUT_TOKENS,
  MAX_RETRIES,
  BASE_RETRY_DELAY_MS,
} from "../utils/constants.js";

export interface GeminiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  responseSchema: object;
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

// ─── OAuth credential types ───────────────────────────────────────────────────

interface OAuthCreds {
  access_token: string;
  scope: string;
  token_type: string;
  id_token: string;
  expiry_date: number; // Unix ms
  refresh_token: string;
}

interface OAuthClientCreds {
  clientId: string;
  clientSecret: string;
}

// ─── Code Assist API types ────────────────────────────────────────────────────
// The Gemini CLI routes through cloudcode-pa.googleapis.com (Code Assist API)
// rather than generativelanguage.googleapis.com. This endpoint accepts the
// cloud-platform OAuth scope that the CLI already has.

interface CodeAssistLoadResponse {
  cloudaicompanionProject?: string;
  currentTier?: { id?: string; name?: string };
}

// The nested Vertex-format request sent inside the Code Assist envelope.
interface VertexGenerateContentRequest {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
}

// Subset of the Code Assist generateContent response we care about.
interface CodeAssistGenerateResponse {
  response?: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thoughtSignature?: string }>; role?: string };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  error?: { code?: number; message?: string; status?: string };
}

const CODE_ASSIST_BASE = "https://cloudcode-pa.googleapis.com";
const CODE_ASSIST_VERSION = "v1internal";

const GEMINI_CLI_CREDS_PATH = path.join(os.homedir(), ".gemini", "oauth_creds.json");

// ─── OAuth CLI credential extraction ─────────────────────────────────────────
// We never hardcode OAuth client credentials. They are extracted at runtime
// from the Gemini CLI's installed bundle — zero config, no secrets in repo.

let cachedClientCreds: OAuthClientCreds | null | undefined = undefined;

async function resolveCliBundleDir(): Promise<string | null> {
  try {
    const geminiPath = execFileSync("which", ["gemini"], { encoding: "utf-8" }).trim();
    if (!geminiPath) return null;

    let resolved = "";
    try {
      resolved = execFileSync("readlink", [geminiPath], { encoding: "utf-8" }).trim();
    } catch {
      // Not a symlink — that's fine.
    }
    const realBinDir = resolved
      ? path.dirname(path.resolve(path.dirname(geminiPath), resolved))
      : path.dirname(geminiPath);

    const candidates = [
      path.join(realBinDir, "..", "libexec", "lib", "node_modules", "@google", "gemini-cli", "bundle"),
      path.join(realBinDir, "..", "..", "lib", "node_modules", "@google", "gemini-cli", "bundle"),
      path.join(realBinDir, "..", "lib", "node_modules", "@google", "gemini-cli", "bundle"),
    ];
    for (const dir of candidates) {
      try {
        await fs.promises.access(dir);
        return dir;
      } catch {
        // try next
      }
    }
  } catch {
    // CLI not on PATH
  }
  return null;
}

async function extractClientCreds(): Promise<OAuthClientCreds | null> {
  const bundleDir = await resolveCliBundleDir();
  if (!bundleDir) return null;
  try {
    const files = await fs.promises.readdir(bundleDir);
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const content = await fs.promises.readFile(path.join(bundleDir, file), "utf-8");
      const idMatch = content.match(/OAUTH_CLIENT_ID\s*=\s*"([^"]+\.apps\.googleusercontent\.com)"/);
      const secMatch = content.match(/OAUTH_CLIENT_SECRET\s*=\s*"(GOCSPX-[^"]+)"/);
      if (idMatch?.[1] && secMatch?.[1]) {
        return { clientId: idMatch[1], clientSecret: secMatch[1] };
      }
    }
  } catch {
    // unreadable bundle
  }
  return null;
}

async function getOAuthClientCreds(): Promise<OAuthClientCreds | null> {
  if (cachedClientCreds !== undefined) return cachedClientCreds;
  cachedClientCreds = await extractClientCreds();
  if (!cachedClientCreds) {
    logger.warn(
      "Gemini CLI OAuth client credentials not found. Token refresh will fail when the access token expires."
    );
  }
  return cachedClientCreds;
}

// ─── OAuth token helpers ──────────────────────────────────────────────────────

async function readOAuthCreds(): Promise<OAuthCreds | null> {
  try {
    const raw = await fs.promises.readFile(GEMINI_CLI_CREDS_PATH, "utf-8");
    return JSON.parse(raw) as OAuthCreds;
  } catch {
    return null;
  }
}

async function refreshOAuthToken(creds: OAuthCreds): Promise<OAuthCreds> {
  logger.debug("OAuth access token expired — refreshing.");
  const clientCreds = await getOAuthClientCreds();
  if (!clientCreds) {
    throw new Error(
      "Cannot refresh OAuth token: Gemini CLI credentials not found in bundle. " +
        "Ensure the `gemini` CLI is installed and in PATH."
    );
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
      client_id: clientCreds.clientId,
      client_secret: clientCreds.clientSecret,
    }).toString(),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OAuth token refresh failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const updated: OAuthCreds = {
    access_token: data["access_token"] as string,
    scope: (data["scope"] as string) ?? creds.scope,
    token_type: (data["token_type"] as string) ?? "Bearer",
    id_token: (data["id_token"] as string) ?? creds.id_token,
    expiry_date: Date.now() + ((data["expires_in"] as number) ?? 3600) * 1000,
    refresh_token: (data["refresh_token"] as string) ?? creds.refresh_token,
  };

  // Persist back so the Gemini CLI also picks up the refreshed token.
  await fs.promises.writeFile(
    GEMINI_CLI_CREDS_PATH,
    JSON.stringify(updated, null, 2),
    "utf-8"
  );
  return updated;
}

// ─── Code Assist project ID ───────────────────────────────────────────────────
// Fetched once per process via :loadCodeAssist and cached in memory.

let cachedCodeAssistProject: string | null | undefined = undefined;

async function getCodeAssistProject(accessToken: string): Promise<string | null> {
  if (cachedCodeAssistProject !== undefined) return cachedCodeAssistProject;

  try {
    const resp = await fetch(
      `${CODE_ASSIST_BASE}/${CODE_ASSIST_VERSION}:loadCodeAssist`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      }
    );
    if (!resp.ok) {
      cachedCodeAssistProject = null;
      return null;
    }
    const data = (await resp.json()) as CodeAssistLoadResponse;
    cachedCodeAssistProject = data.cloudaicompanionProject ?? null;
    logger.info(
      `Code Assist project: ${cachedCodeAssistProject ?? "(none — using personal tier)"}`
    );
  } catch {
    cachedCodeAssistProject = null;
  }
  return cachedCodeAssistProject;
}

// Strip markdown code fences that thinking models sometimes wrap JSON in.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

// ─── GeminiClient ─────────────────────────────────────────────────────────────

export class GeminiClient {
  private readonly apiKey: string | undefined;
  private readonly modelName: string;
  // In-memory token cache.
  private cachedAccessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(apiKey: string | undefined) {
    this.apiKey = apiKey;
    this.modelName =
      process.env.GEMINI_MODEL ??
      (apiKey ? GEMINI_MODEL : GEMINI_MODEL_OAUTH);
  }

  /** Returns true when ~/.gemini/oauth_creds.json is present and readable. */
  static async isOAuthAvailable(): Promise<boolean> {
    return (await readOAuthCreds()) !== null;
  }

  async call(options: GeminiCallOptions): Promise<GeminiResponse> {
    return this.apiKey
      ? this.callWithApiKey(options)
      : this.callWithCodeAssist(options);
  }

  // ── API-key path (Google Generative AI SDK) ───────────────────────────────

  private async callWithApiKey(options: GeminiCallOptions): Promise<GeminiResponse> {
    const genAI = new GoogleGenerativeAI(this.apiKey as string);
    const modelConfig: Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0] = {
      model: this.modelName,
      systemInstruction: options.systemPrompt,
      generationConfig: {
        temperature: options.temperature ?? 0,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseSchema: options.responseSchema as never,
      },
    };
    if (options.useWebSearch) {
      modelConfig.tools = [{ googleSearch: {} } as never];
    }
    const model: GenerativeModel = genAI.getGenerativeModel(modelConfig);
    return this.callSdkWithRetry(model, options.userPrompt);
  }

  private async callSdkWithRetry(
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
      const status =
        (err as Record<string, unknown>)?.status ??
        (err as Record<string, unknown>)?.code;
      if (status === 429 || status === 503 || status === 502) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        logger.warn(
          `Gemini API error (${status}). Retrying in ${delay}ms ` +
            `(attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(delay);
        return this.callSdkWithRetry(model, prompt, attempt + 1);
      }
      throw err;
    }
  }

  // ── Code Assist path (Gemini CLI subscription) ────────────────────────────
  // Routes through cloudcode-pa.googleapis.com which accepts cloud-platform
  // OAuth scope — the same scope the Gemini CLI already has.

  private async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.cachedAccessToken;
    }
    let creds = await readOAuthCreds();
    if (!creds) {
      throw new Error(
        "No OAuth credentials found at ~/.gemini/oauth_creds.json. " +
          "Sign in with the Gemini CLI first: run `gemini` and authenticate."
      );
    }
    if (Date.now() >= creds.expiry_date - 60_000) {
      creds = await refreshOAuthToken(creds);
    }
    this.cachedAccessToken = creds.access_token;
    this.tokenExpiry = creds.expiry_date;
    return creds.access_token;
  }

  private async callWithCodeAssist(
    options: GeminiCallOptions,
    attempt = 0,
    forceRefresh = false
  ): Promise<GeminiResponse> {
    if (forceRefresh) {
      this.cachedAccessToken = null;
      this.tokenExpiry = 0;
    }

    const accessToken = await this.getAccessToken();
    const project = await getCodeAssistProject(accessToken);

    const vertexRequest: VertexGenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: options.userPrompt }] }],
      systemInstruction: { parts: [{ text: options.systemPrompt }] },
      generationConfig: {
        temperature: options.temperature ?? 0,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseSchema: options.responseSchema,
      },
    };
    if (options.useWebSearch) {
      vertexRequest.tools = [{ googleSearch: {} }];
    }

    const envelope: Record<string, unknown> = {
      model: this.modelName,
      user_prompt_id: randomUUID(),
      request: vertexRequest,
    };
    if (project) envelope["project"] = project;

    const resp = await fetch(
      `${CODE_ASSIST_BASE}/${CODE_ASSIST_VERSION}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(envelope),
      }
    );

    if (!resp.ok) {
      const status = resp.status;
      if (status === 401 && !forceRefresh) {
        logger.warn("Code Assist 401 — refreshing token and retrying.");
        return this.callWithCodeAssist(options, attempt, true);
      }
      if ((status === 429 || status === 503 || status === 502) && attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        logger.warn(
          `Code Assist error (${status}). Retrying in ${delay}ms ` +
            `(attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(delay);
        return this.callWithCodeAssist(options, attempt + 1, false);
      }
      const body = await resp.text();
      throw Object.assign(
        new Error(`Gemini API error (${status}): ${body}`),
        { status }
      );
    }

    const data = (await resp.json()) as CodeAssistGenerateResponse;

    // Thinking models emit a thoughtSignature alongside the actual text.
    // We want the last part that contains real text (not an empty thought stub).
    const parts = data.response?.candidates?.[0]?.content?.parts ?? [];
    let rawText = "";
    for (const part of parts) {
      if (typeof part.text === "string" && part.text !== "") {
        rawText = part.text;
      }
    }
    // Strip markdown code fences the thinking model sometimes adds.
    rawText = extractJson(rawText);

    let content: unknown;
    try {
      content = JSON.parse(rawText);
    } catch {
      logger.warn("Code Assist returned non-JSON response. Wrapping as error.");
      content = { _parse_error: true, raw: rawText };
    }

    const usage = data.response?.usageMetadata;
    return {
      content,
      rawText,
      usageMetadata: usage
        ? {
            promptTokenCount: usage.promptTokenCount ?? 0,
            candidatesTokenCount: usage.candidatesTokenCount ?? 0,
            totalTokenCount: usage.totalTokenCount ?? 0,
          }
        : undefined,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
