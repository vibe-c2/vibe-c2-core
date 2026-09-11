/**
 * How many files a clipboard *says* it carries, versus how many the browser
 * actually hands over.
 *
 * Pasting several files copied from a file manager does not reliably deliver
 * all of them. On macOS in particular the browser can expose a single `File`
 * for a multi-file selection, so a user who copies five images and pastes
 * sees one appear and four vanish with no explanation. Nothing in our own
 * paste path truncates — the extractors and the upload loop both handle N
 * files — so the only thing we can do is notice the shortfall and say so.
 *
 * The count is a *hint*, deliberately generous: whichever of the three
 * surfaces reports the most is taken as what the user copied. Over-counting
 * would be a false alarm, so callers must only act on it when at least one
 * file did come through — see clipboardFileShortfall.
 */
export function countClipboardFileHints(
  clipboardData: DataTransfer | null,
): number {
  if (!clipboardData) return 0

  let itemEntries = 0
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === "file") itemEntries += 1
  }

  // A file-manager copy usually also lands as a uri-list of file:// URLs,
  // which survives even when only one File materialises. Comment lines are
  // part of the format (RFC 2483) and are not entries.
  const uriEntries = (clipboardData.getData("text/uri-list") || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !line.startsWith("#")).length

  return Math.max(itemEntries, clipboardData.files.length, uriEntries)
}

/**
 * How many files the clipboard promised but did not deliver, or 0 when
 * everything arrived.
 *
 * Returns 0 when nothing came through at all. That case is not a shortfall:
 * pasting a URL or plain text also populates `text/uri-list`, and warning
 * about "missing files" on an ordinary link paste would be worse than saying
 * nothing. A shortfall is only meaningful once we know this was a file paste,
 * which `extracted > 0` establishes.
 */
export function clipboardFileShortfall(
  clipboardData: DataTransfer | null,
  extracted: number,
): number {
  if (extracted <= 0) return 0
  const hinted = countClipboardFileHints(clipboardData)
  return hinted > extracted ? hinted - extracted : 0
}
