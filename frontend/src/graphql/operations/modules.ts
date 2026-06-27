import { graphql } from "@/graphql/gql"

export const ModuleFields = graphql(`
  fragment ModuleFields on Module {
    instance
    type
    name
    version
    description
    status
    lastStatus
    registeredAt
    lastHeartbeatAt
    deregisteredAt
    deregisterReason
    declaredDeadAt
  }
`)

export const ModulesQuery = graphql(`
  query Modules($status: [String!]) {
    modules(status: $status) {
      ...ModuleFields
    }
  }
`)

export const RemoveModuleMutation = graphql(`
  mutation RemoveModule($instance: ID!) {
    removeModule(instance: $instance) {
      ...ModuleFields
    }
  }
`)

// Real-time subscription — streams module lifecycle changes (registered /
// deregistered / dead). Admin-only (gated by module:read). The server includes
// the full Module row on every event.
export const ModuleChangedSubscription = graphql(`
  subscription ModuleChanged {
    moduleChanged {
      action
      instance
      module {
        ...ModuleFields
      }
    }
  }
`)
