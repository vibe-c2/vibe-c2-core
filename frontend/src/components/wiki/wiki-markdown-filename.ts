/**
 * Turn a page title into a filename.
 *
 * Titles are free text and routinely contain slashes, colons and quotes, any
 * of which either breaks the download or gets mangled by the OS. Strip them,
 * collapse the gaps, and fall back to a generic name rather than producing a
 * file called ".md".
 */
export function markdownFilename(title: string): string {
  const cleaned = title
    // Path separators and the characters Windows reserves.
    .replace(/[\\/:*?"<>|]/g, " ")
    // Control characters are legal in a JS string and not in a filename.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    // A trailing dot makes a file Windows will not open, and a name that is
    // all dots would leave nothing but the extension.
    .replace(/\.+$/, "")
    .trim()
  return cleaned === "" ? "wiki-page" : cleaned
}
