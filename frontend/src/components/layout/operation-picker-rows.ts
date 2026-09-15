// One row of the picker: an operation, and the section label to draw above
// it when it opens a new section. Recents come first so the operation you
// were on an hour ago is one click away instead of buried in the server's
// alphabetical page; the rest of the list follows unchanged.
export interface PickerRow {
  op: PickerOperation;
  section: "Recent" | "All operations" | null;
}

export type PickerOperation = {
  id: string;
  name: string;
  description?: string | null;
};

/**
 * Merge the user's recently scoped operations ahead of the server list.
 * Recents that the server list also carries take the server's name and
 * description, which are fresher than the stored copy. Searching bypasses
 * recents entirely: a filter is a request for the whole set, ordered by
 * the server.
 */
export function buildPickerRows(
  recents: PickerOperation[],
  loaded: PickerOperation[],
  searching: boolean,
): PickerRow[] {
  if (searching || recents.length === 0) {
    return loaded.map((op) => ({ op, section: null }));
  }
  const fresh = new Map(loaded.map((op) => [op.id, op]));
  const recentIds = new Set(recents.map((op) => op.id));
  const rows: PickerRow[] = recents.map((op, i) => ({
    op: fresh.get(op.id) ?? op,
    section: i === 0 ? "Recent" : null,
  }));
  let first = true;
  for (const op of loaded) {
    if (recentIds.has(op.id)) continue;
    rows.push({ op, section: first ? "All operations" : null });
    first = false;
  }
  return rows;
}
