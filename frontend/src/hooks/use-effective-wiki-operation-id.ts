import { useScopedOperationStore } from "@/stores/scoped-operation"
import { useWikiTreeModeStore } from "@/stores/wiki-tree-mode"
import { PUBLIC_OPERATION_ID } from "@/lib/public-operation"

export interface EffectiveWikiOperation {
  /** The operation id the wiki UI should query against. Never null. */
  effectiveOperationId: string
  /** True when the effective op is the Public synthetic operation. */
  isPublicMode: boolean
  /** True when there's a real scoped operation (independent of mode). */
  hasRealScope: boolean
}

/**
 * Resolves which operation the wiki tree should target. Combines the user's
 * scoped operation (if any) with their tree-mode preference:
 *
 *  - No scope                       → Public (forced).
 *  - Scoped + mode=operation        → scoped op.
 *  - Scoped + mode=public           → Public.
 *
 * Backend authorization on PUBLIC_OPERATION_ID grants any authenticated user
 * implicit operator access, so `useMyOperationRole(effectiveOperationId)` works
 * uniformly for either branch.
 */
export function useEffectiveWikiOperation(): EffectiveWikiOperation {
  const scopedId = useScopedOperationStore((s) => s.scopedOperation?.id ?? null)
  const mode = useWikiTreeModeStore((s) => s.mode)

  const hasRealScope = scopedId !== null
  const isPublicMode = !hasRealScope || mode === "public"
  const effectiveOperationId = isPublicMode ? PUBLIC_OPERATION_ID : scopedId!

  return { effectiveOperationId, isPublicMode, hasRealScope }
}
