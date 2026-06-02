// Single source of truth for the filter options surfaced in the UI. Backend
// also whitelists these values in `parseSubjectKinds`, so adding a third
// option requires changes in both places.
export const SUBJECT_KIND_OPTIONS: ReadonlyArray<{
  value: string
  label: string
}> = [
  { value: "credential", label: "Credentials" },
  { value: "wiki_document", label: "Wiki documents" },
  { value: "task", label: "Tasks" },
  { value: "custom_event", label: "Custom events" },
]
