// parseTags splits a comma-separated tag input string into a normalised
// array: trimmed entries, blanks dropped. Shared by every hash dialog that
// accepts a raw tag string from the user. Server-side normalisation
// (lowercase, dedupe) still runs on top — this is purely a UI parser.
export function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
}
