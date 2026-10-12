import { extractText } from "unpdf";
import { AIError } from "@/lib/ai/provider";
import { type AppContext, nowOf } from "./context";

/**
 * Turns an uploaded LinkedIn PDF ("More → Save to PDF") or a profile
 * screenshot into plain text for the profile box. The user reviews the text
 * before anything is saved; it's treated as untrusted like any pasted text.
 */

export const MAX_IMPORT_BYTES = 3.8 * 1024 * 1024;

type Kind = "pdf" | "image/png" | "image/jpeg" | "image/webp";

/** Identifies the file by its first bytes, not by its (spoofable) name or MIME type. */
export function sniff(bytes: Uint8Array): Kind | null {
  const b = bytes;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // %PDF
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^Page \d+ of \d+$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60_000);
}

export interface ImportResult {
  text: string;
  method: "pdf" | "image";
  pages?: number;
}

export async function extractProfileText(ctx: AppContext, bytes: Uint8Array): Promise<ImportResult> {
  if (bytes.byteLength === 0) throw new AIError("invalid_output", "That file is empty.");
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new AIError("invalid_output", "Files must be under 3.8 MB.");
  const kind = sniff(bytes);
  if (!kind) throw new AIError("invalid_output", "Upload a PDF, PNG, JPG, or WebP file.");

  if (kind === "pdf") {
    let result: { totalPages: number; text: string };
    try {
      result = await extractText(new Uint8Array(bytes), { mergePages: true });
    } catch {
      throw new AIError("invalid_output", "Couldn't read that PDF. Try saving it again, or paste the text instead.");
    }
    const text = cleanExtractedText(result.text);
    if (!text) throw new AIError("invalid_output", "That PDF has no selectable text (it may be a scanned image). Try a screenshot instead.");
    return { text, method: "pdf", pages: result.totalPages };
  }

  if (!ctx.ai.transcribeImage) {
    throw new AIError("not_configured", "Reading screenshots needs the Claude API. Add ANTHROPIC_API_KEY, or upload a PDF instead.");
  }
  // Counts toward the daily AI limit like any other AI request.
  const used = await ctx.repo.incrementAiUsage(nowOf(ctx).toISOString().slice(0, 10));
  if (used > ctx.aiDailyLimit) throw new AIError("usage_limit", `You've reached today's AI limit (${ctx.aiDailyLimit} requests).`);
  const text = cleanExtractedText(await ctx.ai.transcribeImage(Buffer.from(bytes).toString("base64"), kind));
  return { text, method: "image" };
}
