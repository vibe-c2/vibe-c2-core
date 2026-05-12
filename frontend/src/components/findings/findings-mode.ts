// FindingsMode describes whether the Findings page is currently looking at a
// single scoped operation or running across the caller's accessible operations.
//
// - kind: "scoped"  — an operation is selected via the sidebar switcher.
//   All Findings tabs query that one operation.
// - kind: "global"  — no operation is scoped. Tabs query across operationIds:
//     null  ⇒ all operations the caller is a member of (server resolves);
//     []    ⇒ explicit empty selection, results render empty;
//     [...] ⇒ caller-picked subset.
//
// Reusable across future Findings tabs (hosts, services, ...). Each tab
// implementation simply branches on `mode.kind` and either calls its
// per-operation query or its `my*` cross-operation query.
export type FindingsMode =
  | { kind: "scoped"; operationId: string }
  | { kind: "global"; operationIds: string[] | null }
