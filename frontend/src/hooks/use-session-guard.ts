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
      const { session } = data.mySessionChanged

      // If the current session was terminated, clear auth and redirect to login.
      // No backend logout needed — the session is already revoked server-side.
      if (session?.isCurrent && session.status === "INACTIVE") {
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
