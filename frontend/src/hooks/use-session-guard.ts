// Global session guard — subscribes to the current user's session events
// and forces a client-side logout if the current session is revoked.
//
// Also invalidates session query caches so the My Sessions dialog stays
// in sync without needing its own subscription.

import { useQueryClient } from "@tanstack/react-query"
import { useSubscription } from "@/hooks/use-subscription"
import { MySessionChangedDocument } from "@/graphql/gql/graphql"
import { sessionKeys } from "@/graphql/hooks/sessions"
import { useAuthStore } from "@/stores/auth"

export function useSessionGuard() {
  const queryClient = useQueryClient()

  useSubscription(MySessionChangedDocument, undefined, {
    onData: (data) => {
      const { action, session } = data.mySessionChanged

      // If the current session was terminated, clear auth and redirect to login.
      // No backend logout needed — the session is already revoked server-side.
      //
      // We key the decision off `action === "DELETED"` (which the backend
      // maps exclusively from the session.terminated topic — see
      // toSessionEvent in core/pkg/graphql/resolver/subscription_helpers.go)
      // rather than the derived `status` field. The status field can
      // legitimately arrive as INACTIVE on a session.refreshed event if the
      // backend ever regresses and forgets to decorate Status from the topic
      // (see docs/frontend-auth-review.md for the original incident). The
      // action-based check is immune to that class of bug because action is
      // set directly from the topic, with no dependence on whether Mongo
      // rows happen to be decorated with Redis-side state.
      if (action === "DELETED" && session?.isCurrent) {
        useAuthStore.getState().clearSession()
        return
      }

      // Otherwise, update caches for the My Sessions dialog.
      if (session) {
        queryClient.setQueryData(sessionKeys.detail(session.id), { session })
      }

      queryClient.invalidateQueries({ queryKey: sessionKeys.myInfiniteLists() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.myLists() })
    },
  })
}
