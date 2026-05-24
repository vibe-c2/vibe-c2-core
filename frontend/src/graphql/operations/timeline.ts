import { graphql } from "@/graphql/gql"

export const TimelineEventFields = graphql(`
  fragment TimelineEventFields on TimelineEvent {
    id
    operationId
    topic
    subjectKind
    subjectId
    subjectName
    occurredAt
    metadata
    actor {
      id
      username
    }
  }
`)

export const TimelineBucketsQuery = graphql(`
  query TimelineBuckets(
    $operationId: ID!
    $granularity: TimelineGranularity = DAY
    $timezone: String!
    $from: String
    $to: String
    $types: [String!]
    $actorIds: [ID!]
  ) {
    timelineBuckets(
      operationId: $operationId
      granularity: $granularity
      timezone: $timezone
      from: $from
      to: $to
      types: $types
      actorIds: $actorIds
    ) {
      bucketStart
      count
      topicCounts {
        topic
        subjectKind
        count
      }
    }
  }
`)

export const TimelineEventsByDayQuery = graphql(`
  query TimelineEventsByDay(
    $operationId: ID!
    $date: String!
    $timezone: String!
    $granularity: TimelineGranularity = DAY
    $types: [String!]
    $actorIds: [ID!]
    $first: Int = 100
    $after: String
  ) {
    timelineEventsByDay(
      operationId: $operationId
      date: $date
      timezone: $timezone
      granularity: $granularity
      types: $types
      actorIds: $actorIds
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...TimelineEventFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`)

export const TimelineEventAddedSubscription = graphql(`
  subscription TimelineEventAdded($operationId: ID!) {
    timelineEventAdded(operationId: $operationId) {
      ...TimelineEventFields
    }
  }
`)

// --- Custom timeline event mutations -------------------------------------
//
// Mutations targeting user-authored annotation events. The resolver
// publishes TopicOperationEventLogged after every successful write, so
// the live subscription already invalidates the timeline cache — these
// mutations only need to invalidate locally as a belt-and-braces measure
// for the originating client (the round-trip subscription may not have
// fired yet when the mutation resolves).

export const CreateCustomTimelineEventMutation = graphql(`
  mutation CreateCustomTimelineEvent(
    $operationId: ID!
    $input: CreateCustomTimelineEventInput!
  ) {
    createCustomTimelineEvent(operationId: $operationId, input: $input) {
      ...TimelineEventFields
    }
  }
`)

export const UpdateCustomTimelineEventMutation = graphql(`
  mutation UpdateCustomTimelineEvent(
    $id: ID!
    $input: UpdateCustomTimelineEventInput!
  ) {
    updateCustomTimelineEvent(id: $id, input: $input) {
      ...TimelineEventFields
    }
  }
`)

export const DeleteCustomTimelineEventMutation = graphql(`
  mutation DeleteCustomTimelineEvent($id: ID!) {
    deleteCustomTimelineEvent(id: $id)
  }
`)
