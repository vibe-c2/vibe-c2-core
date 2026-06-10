import { graphql } from "@/graphql/gql"

// Row fragment for the Hosts table. Unlike hashes (which leave the linked
// credential off the row), interfaces/routes ARE the host's primary content
// and are small bounded lists — loading them inline lets the edit dialog
// prefill straight from the clicked row's cached node, no follow-up query.
// `operation` is intentionally skipped: it's a per-row DB lookup and the
// Hosts tab only exists in operation-scoped mode where the parent is implicit.
export const HostFields = graphql(`
  fragment HostFields on Host {
    id
    operationId
    hostname
    os
    interfaces {
      name
      mac
      addresses
    }
    routes {
      destination
      gateway
      interface
    }
    createdBy {
      id
      username
    }
    createdAt
    updatedAt
  }
`)

export const HostsQuery = graphql(`
  query Hosts($operationId: ID!, $search: String, $first: Int, $after: String) {
    hosts(
      operationId: $operationId
      search: $search
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...HostFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`)

export const CreateHostMutation = graphql(`
  mutation CreateHost($operationId: ID!, $input: CreateHostInput!) {
    createHost(operationId: $operationId, input: $input) {
      ...HostFields
    }
  }
`)

export const UpdateHostMutation = graphql(`
  mutation UpdateHost($id: ID!, $input: UpdateHostInput!) {
    updateHost(id: $id, input: $input) {
      ...HostFields
    }
  }
`)

export const DeleteHostMutation = graphql(`
  mutation DeleteHost($id: ID!) {
    deleteHost(id: $id)
  }
`)

// The handler invalidates and refetches the list rather than patching rows in
// place, so it only needs the event to fire — no host payload is selected,
// sparing the server a full host resolution per event.
export const HostChangedSubscription = graphql(`
  subscription HostChanged($operationId: ID!) {
    hostChanged(operationId: $operationId) {
      action
      hostId
    }
  }
`)
