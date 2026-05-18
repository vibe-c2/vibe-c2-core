// Global scoped-operation guard — validates the restored scope on mount and
// subscribes to real-time changes so the scope is cleared when the user loses
// access (operation deleted, user kicked) and updated when metadata changes.

import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { useSubscription } from "@/hooks/use-subscription"
import { graphqlClient } from "@/lib/graphql-client"
import {
  MyOperationRoleDocument,
  OperationDocument,
  OperationChangedDocument,
  OperationMemberChangedDocument,
} from "@/graphql/gql/graphql"
import { operationKeys } from "@/graphql/hooks/operations"
import { useAuthStore } from "@/stores/auth"
import { useScopedOperationStore } from "@/stores/scoped-operation"

export function useScopedOperationGuard() {
  const scopedOperation = useScopedOperationStore((s) => s.scopedOperation)
  const isValidating = useScopedOperationStore((s) => s.isValidating)
  const scopeOperation = useScopedOperationStore((s) => s.scopeOperation)
  const unscopeOperation = useScopedOperationStore((s) => s.unscopeOperation)
  const setValidating = useScopedOperationStore((s) => s.setValidating)

  const currentUserId = useAuthStore((s) => s.user?.userId)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const queryClient = useQueryClient()

  // Track the scoped name in a ref so subscription callbacks always see the
  // latest value. Update via effect rather than during render — refs must not
  // be written during render (react-hooks/refs).
  const scopedNameRef = useRef<string | null>(scopedOperation?.name ?? null)
  useEffect(() => {
    scopedNameRef.current = scopedOperation?.name ?? null
  }, [scopedOperation?.name])

  const scopedId = scopedOperation?.id ?? null

  // Track last successful validation to avoid redundant requests on rapid tab switching.
  const lastValidatedAtRef = useRef(0)
  const REVALIDATION_COOLDOWN_MS = 30_000

  // Shared validation logic.
  // silent=false (default): clears isValidating on success — used by the initial hydration gate.
  // silent=true: never touches isValidating — used by tab-focus background re-validation.
  //
  // Routes the MyOperationRole call through TanStack Query so the page-level
  // useMyOperationRole(operationId) hook (mounted right after the gate
  // succeeds) lands on a cache hit instead of firing the same query a second
  // time. ensureQueryData on mount; fetchQuery (always network) on focus
  // revalidate so a stale cached role doesn't mask a fresh "you were kicked".
  const doValidate = useCallback(async (silent: boolean, signal?: AbortSignal) => {
    try {
      const fetchRole = () =>
        graphqlClient(MyOperationRoleDocument, { operationId: scopedId! })
      const result = silent
        ? await queryClient.fetchQuery({
            queryKey: operationKeys.myRole(scopedId!),
            queryFn: fetchRole,
          })
        : await queryClient.ensureQueryData({
            queryKey: operationKeys.myRole(scopedId!),
            queryFn: fetchRole,
          })
      if (signal?.aborted) return

      if (result.myOperationRole) {
        lastValidatedAtRef.current = Date.now()
        if (!silent) setValidating(false)
        return
      }

      if (hasPermission("admin")) {
        try {
          await queryClient.ensureQueryData({
            queryKey: operationKeys.detail(scopedId!),
            queryFn: () => graphqlClient(OperationDocument, { id: scopedId! }),
          })
          if (signal?.aborted) return
          lastValidatedAtRef.current = Date.now()
          if (!silent) setValidating(false)
          return
        } catch {
          // Operation doesn't exist or other error — fall through to clear.
        }
      }

      if (signal?.aborted) return
      const name = scopedNameRef.current
      unscopeOperation()
      toast.info(`Operation "${name}" is no longer accessible. Scope cleared.`)
    } catch {
      if (signal?.aborted) return
      const name = scopedNameRef.current
      unscopeOperation()
      toast.info(`Operation "${name}" is no longer accessible. Scope cleared.`)
    }
  }, [scopedId, hasPermission, setValidating, unscopeOperation, queryClient])

  // --- Validation on mount / hydrate (blocking — shows loading gate) ---
  useEffect(() => {
    if (!scopedId || !isValidating) return
    const ac = new AbortController()
    doValidate(false, ac.signal)
    return () => ac.abort()
  }, [scopedId, isValidating, doValidate])

  // --- Re-validate scope when tab regains focus (non-blocking) ---
  // SSE subscriptions disconnect when the tab is backgrounded. Membership or
  // deletion changes during that window are missed, leaving a stale scope.
  // Validate in the background so the page content stays visible.
  useEffect(() => {
    if (!scopedId) return

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return
      if (Date.now() - lastValidatedAtRef.current < REVALIDATION_COOLDOWN_MS) return
      doValidate(true)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [scopedId, doValidate])

  // --- Real-time: operation changes (rename, delete) ---
  // Note: operation names shown in toasts are user-controlled content. Sonner
  // renders as React nodes (not raw HTML) so this is not XSS, but crafted
  // names could produce misleading toast text. Accepted risk — names are
  // already visible throughout the UI.
  //
  // Subscribe without operationId filter (receives all ops the user belongs
  // to) and filter client-side. This lets subscription-registry dedup this
  // hook with the page-level useOperationChangedSubscription on /operations,
  // collapsing two SSE connections into one.
  useSubscription(
    OperationChangedDocument,
    undefined,
    {
      enabled: scopedId !== null,
      onData: (data) => {
        const { action, operationId, operation } = data.operationChanged
        // Filter: only react to events for the scoped op.
        if (operationId !== scopedId) return

        if (action === "DELETED") {
          const name = scopedNameRef.current
          unscopeOperation()
          toast.warning(`Operation "${name}" was deleted. Scope cleared.`)
          return
        }

        // Update stored name if it changed (e.g. rename).
        if (action === "UPDATED" && operation && scopedId) {
          scopeOperation({ id: scopedId, name: operation.name, description: operation.description })
        }
      },
    },
  )

  // --- Real-time: membership changes (user kicked) ---
  // Same dedup rationale as operationChanged above: unfiltered subscription
  // + client-side filter lets the registry share one SSE with the page sub.
  useSubscription(
    OperationMemberChangedDocument,
    undefined,
    {
      enabled: scopedId !== null,
      onData: (data) => {
        const { action, operationId, userId } = data.operationMemberChanged
        if (operationId !== scopedId) return

        // If the current user was removed from the scoped operation, clear scope.
        if (action === "DELETED" && userId === currentUserId) {
          const name = scopedNameRef.current
          unscopeOperation()
          // Drop all cached operation data so the /operations list refetches
          // without the now-inaccessible operation on next mount.
          queryClient.invalidateQueries({ queryKey: operationKeys.all })
          toast.warning(`You were removed from operation "${name}". Scope cleared.`)
          return
        }

        // Role change targeting the current user: refetch myRole so any
        // page that gates UI on it (e.g. wiki editor's isEditor) flips
        // to the new permission level without a reload.
        if (action === "UPDATED" && userId === currentUserId && scopedId) {
          queryClient.invalidateQueries({ queryKey: operationKeys.myRole(scopedId) })
          queryClient.invalidateQueries({ queryKey: operationKeys.detail(scopedId) })
          toast.info(`Your role in operation "${scopedNameRef.current}" changed.`)
        }
      },
    },
  )
}
