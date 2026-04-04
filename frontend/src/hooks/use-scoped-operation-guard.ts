// Global scoped-operation guard — validates the restored scope on mount and
// subscribes to real-time changes so the scope is cleared when the user loses
// access (operation deleted, user kicked) and updated when metadata changes.

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useSubscription } from "@/hooks/use-subscription"
import { graphqlClient } from "@/lib/graphql-client"
import {
  MyOperationRoleDocument,
  OperationDocument,
  OperationChangedDocument,
  OperationMemberChangedDocument,
} from "@/graphql/gql/graphql"
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

  // Track the scoped name in a ref so subscription callbacks always see the latest.
  const scopedNameRef = useRef(scopedOperation?.name ?? null)
  scopedNameRef.current = scopedOperation?.name ?? null

  const scopedId = scopedOperation?.id ?? null

  // --- Validation on mount / hydrate ---
  useEffect(() => {
    if (!scopedId || !isValidating) return

    let cancelled = false

    async function validate() {
      try {
        // Check if user is a member of the operation.
        const result = await graphqlClient(MyOperationRoleDocument, { operationId: scopedId! })
        if (cancelled) return

        if (result.myOperationRole) {
          // Still a member — scope is valid.
          setValidating(false)
          return
        }

        // myOperationRole returned null — not a member.
        // App admins can access any operation without membership.
        if (hasPermission("admin")) {
          try {
            await graphqlClient(OperationDocument, { id: scopedId! })
            if (cancelled) return
            setValidating(false)
            return
          } catch {
            // Operation doesn't exist or other error — fall through to clear.
          }
        }

        if (cancelled) return
        const name = scopedNameRef.current
        unscopeOperation()
        toast.info(`Operation "${name}" is no longer accessible. Scope cleared.`)
      } catch {
        if (cancelled) return
        // Query failed (network error, operation deleted, etc.) — clear scope.
        const name = scopedNameRef.current
        unscopeOperation()
        toast.info(`Operation "${name}" is no longer accessible. Scope cleared.`)
      }
    }

    validate()
    return () => { cancelled = true }
  }, [scopedId, isValidating, hasPermission, setValidating, unscopeOperation])

  // --- Re-validate scope when tab regains focus ---
  // SSE subscriptions disconnect when the tab is backgrounded. Membership or
  // deletion changes during that window are missed, leaving a stale scope.
  // Triggering validation on visibility change catches those cases.
  useEffect(() => {
    if (!scopedId) return

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setValidating(true)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [scopedId, setValidating])

  // --- Real-time: operation changes (rename, delete) ---
  // Note: operation names shown in toasts are user-controlled content. Sonner
  // renders as React nodes (not raw HTML) so this is not XSS, but crafted
  // names could produce misleading toast text. Accepted risk — names are
  // already visible throughout the UI.
  useSubscription(
    OperationChangedDocument,
    scopedId ? { operationId: scopedId } : undefined,
    {
      enabled: scopedId !== null,
      onData: (data) => {
        const { action, operation } = data.operationChanged

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
  useSubscription(
    OperationMemberChangedDocument,
    scopedId ? { operationId: scopedId } : undefined,
    {
      enabled: scopedId !== null,
      onData: (data) => {
        const { action, userId } = data.operationMemberChanged

        // If the current user was removed from the scoped operation, clear scope.
        if (action === "DELETED" && userId === currentUserId) {
          const name = scopedNameRef.current
          unscopeOperation()
          toast.warning(`You were removed from operation "${name}". Scope cleared.`)
        }
      },
    },
  )
}
