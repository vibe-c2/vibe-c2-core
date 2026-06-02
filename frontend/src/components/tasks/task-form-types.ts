// Shared input shape between create and edit dialogs. Stage and status are
// not part of this form — those flow through the kanban drag-drop and the
// status-required modal, where the invariant is enforced uniformly. Risk
// and profit scores are constrained to 0..10 client-side as a courtesy;
// the server is the source of truth on the bound.
export interface TaskFormValues {
  name: string
  description: string
  riskScore: number
  riskDescription: string
  profitScore: number
  profitDescription: string
}

export const emptyTaskFormValues: TaskFormValues = {
  name: "",
  description: "",
  riskScore: 0,
  riskDescription: "",
  profitScore: 0,
  profitDescription: "",
}
