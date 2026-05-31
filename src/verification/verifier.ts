import * as fs from "fs/promises";
import { logger } from "../utils/logger.js";

export interface VerificationResult {
  annotatedSummary: unknown;
  unverifiedIdentifiers: string[];
  verifiedIdentifiers: string[];
  webSourcedIdentifiers: string[];
}

export class StructuralVerifier {
  async verify(
    summary: unknown,
    filePaths: string[],
    webSourcedTerms: string[] = []
  ): Promise<VerificationResult> {
    const identifiers = this.extractIdentifiers(summary);
    logger.debug(`Verifier: found ${identifiers.length} identifiers to check`);

    const verified: string[] = [];
    const unverified: string[] = [];
    const webSourced: string[] = [];

    for (const id of identifiers) {
      if (webSourcedTerms.includes(id)) {
        webSourced.push(id);
        continue;
      }

      const found = await this.grepFiles(id, filePaths);
      if (found) {
        verified.push(id);
      } else {
        unverified.push(id);
      }
    }

    logger.debug(
      `Verifier: ${verified.length} verified, ${unverified.length} unverified, ${webSourced.length} web-sourced`
    );

    const annotated = this.annotateSummary(summary, unverified, webSourced);

    return {
      annotatedSummary: annotated,
      unverifiedIdentifiers: unverified,
      verifiedIdentifiers: verified,
      webSourcedIdentifiers: webSourced,
    };
  }

  private extractIdentifiers(obj: unknown): string[] {
    const identifiers = new Set<string>();

    const walk = (value: unknown) => {
      if (typeof value === "string") {
        // camelCase: lowercase start + at least one uppercase inside
        const camelCase = value.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) ?? [];
        // PascalCase: uppercase start + at least one more uppercase or a lowercase run with uppercase
        const pascalCase = value.match(/\b[A-Z][a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[A-Z]{2,}[a-z][a-zA-Z0-9]*\b/g) ?? [];
        // snake_case: must contain at least one underscore
        const snakeCase = value.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g) ?? [];
        const filePaths = value.match(/\.{1,2}\/[^\s"']+/g) ?? [];

        [...camelCase, ...pascalCase, ...snakeCase, ...filePaths].forEach((id) => {
          if (!this.isCommonWord(id)) {
            identifiers.add(id);
          }
        });
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value !== null && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };

    walk(obj);
    return Array.from(identifiers);
  }

  private async grepFiles(identifier: string, filePaths: string[]): Promise<boolean> {
    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        if (content.includes(identifier)) {
          return true;
        }
      } catch {
        // File not readable — skip
      }
    }
    return false;
  }

  private annotateSummary(
    summary: unknown,
    unverified: string[],
    webSourced: string[]
  ): unknown {
    if (unverified.length === 0 && webSourced.length === 0) {
      return summary;
    }

    // Replace longer identifiers first so shorter substrings don't corrupt them
    const sortedUnverified = [...unverified].sort((a, b) => b.length - a.length);
    const sortedWebSourced = [...webSourced].sort((a, b) => b.length - a.length);

    const annotate = (value: unknown): unknown => {
      if (typeof value === "string") {
        let annotated = value;
        for (const id of sortedUnverified) {
          annotated = annotated.replace(
            new RegExp(`\\b${escapeRegExp(id)}\\b`, "g"),
            `${id}[UNVERIFIED]`
          );
        }
        for (const id of sortedWebSourced) {
          annotated = annotated.replace(
            new RegExp(`\\b${escapeRegExp(id)}\\b`, "g"),
            `${id}[WEB_SOURCE]`
          );
        }
        return annotated;
      } else if (Array.isArray(value)) {
        return value.map(annotate);
      } else if (value !== null && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, annotate(v)])
        );
      }
      return value;
    };

    return annotate(summary);
  }

  private static readonly COMMON_WORDS = new Set([
    "the", "and", "for", "not", "with", "this", "from", "that", "have",
    "are", "was", "were", "been", "being", "has", "had", "will", "would",
    "could", "should", "may", "might", "must", "can", "all", "any", "both",
    "each", "few", "more", "most", "other", "some", "such", "than", "too",
    "very", "just", "also", "into", "onto", "over", "under", "after",
    "before", "between", "through", "during", "including", "without",
    "within", "along", "following", "across", "behind", "beyond", "plus",
    "except", "but", "up", "out", "around", "down", "off", "about",
    "above", "below", "between", "here", "there", "when", "where", "why",
    "how", "what", "which", "who", "whom", "whose", "whether", "while",
    "although", "because", "since", "unless", "until", "even", "return",
    "true", "false", "null", "undefined", "string", "number", "boolean",
    "object", "array", "function", "class", "interface", "type", "const",
    "let", "var", "import", "export", "default", "from", "async", "await",
    "new", "delete", "typeof", "instanceof", "void", "throw", "catch",
    "finally", "else", "switch", "case", "break", "continue", "pass",
    "None", "True", "False", "self", "super", "extends", "implements",
  ]);

  private isCommonWord(word: string): boolean {
    return StructuralVerifier.COMMON_WORDS.has(word.toLowerCase());
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
