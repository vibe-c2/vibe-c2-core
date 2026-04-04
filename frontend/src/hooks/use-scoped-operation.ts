import { useScopedOperationStore } from "@/stores/scoped-operation"

/** Returns the currently scoped operation ({ id, name }) or null. */
export function useScopedOperation() {
  return useScopedOperationStore((s) => s.scopedOperation)
}

/** Returns just the scoped operation ID, or null if nothing is scoped. */
export function useScopedOperationId() {
  return useScopedOperationStore((s) => s.scopedOperation?.id ?? null)
}
