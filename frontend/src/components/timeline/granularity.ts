import type { TimelineGranularity } from "@/graphql/gql/graphql"

// granularityNoun maps the GraphQL enum to a lower-case unit noun for UI
// labels ("Click any day...", "No events in this week."). Centralised so the
// canvas, the day panel, and any future surface stay consistent.
export function granularityNoun(g: TimelineGranularity): string {
  switch (g) {
    case "WEEK":
      return "week"
    case "MONTH":
      return "month"
    default:
      return "day"
  }
}
