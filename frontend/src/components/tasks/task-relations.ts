// Shared types and pure helpers for the task relations editor. Kept in a
// .ts sibling so the React component file stays component-only — required
// for Vite Fast Refresh, which won't HMR a module that mixes components
// and value exports.

export interface RelationItem {
  id: string
  label: string
  hint?: string
}

export interface TaskRelationsValues {
  assignees: RelationItem[]
  wikiReferences: RelationItem[]
  credentialReferences: RelationItem[]
}

export const emptyTaskRelationsValues: TaskRelationsValues = {
  assignees: [],
  wikiReferences: [],
  credentialReferences: [],
}

// idsEqual compares two id arrays as sets — order in the form state does
// not matter for the server-side replace mutations, so we skip an unchanged
// relation rather than firing a no-op setTask* call.
export function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  for (const id of b) if (!sa.has(id)) return false
  return true
}
