/**
 * Defenses for pasted third-party content (LinkedIn profiles, email threads).
 *
 * 1. `untrusted()` fences pasted text inside clearly labelled tags and strips
 *    anything that could close the fence early. The system prompt tells the
 *    model that fenced content is data, never instructions.
 * 2. `isGrounded()` checks that every "evidence quote" the model returns
 *    actually appears in the material the user provided. Ungrounded quotes are
 *    removed, so fabricated profile details can't slip into the UI.
 * 3. Length caps keep requests bounded (cost + context abuse).
 */

export const MAX_SOURCE_CHARS = 30_000;
export const MAX_NOTES_CHARS = 20_000;

export function untrusted(label: string, text: string, maxChars = MAX_SOURCE_CHARS): string {
  if (!/^[a-z_]+$/.test(label)) throw new Error(`Invalid untrusted label: ${label}`);
  const body = (text ?? "")
    .slice(0, maxChars)
    // Neutralise anything that looks like our fence tags or a fake system/role tag.
    .replace(/<\/?\s*(untrusted[a-z_]*|system|assistant|user|instructions?)[^>]*>/gi, "[tag removed]");
  return `<untrusted_${label}>\n${body.trim() || "(empty)"}\n</untrusted_${label}>`;
}

/** Lower-cases, unifies quotes/dashes, and collapses whitespace + punctuation. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * True when the quote (allowing "…" gaps) appears in the source material.
 * Very short quotes (< 3 chars after normalising) are rejected as meaningless.
 */
export function isGrounded(quote: string, sources: string | string[]): boolean {
  const haystack = normalizeForMatch(Array.isArray(sources) ? sources.join("\n") : sources);
  const parts = quote
    .split(/\.\.\.|…/)
    .map(normalizeForMatch)
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => p.length >= 3 && haystack.includes(p));
}

/** Loose check that a proper noun (e.g. a company) is mentioned in the sources. */
export function mentions(name: string, sources: string | string[]): boolean {
  const n = normalizeForMatch(name);
  if (!n) return false;
  return normalizeForMatch(Array.isArray(sources) ? sources.join("\n") : sources).includes(n);
}
