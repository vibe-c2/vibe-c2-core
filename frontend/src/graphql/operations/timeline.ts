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
