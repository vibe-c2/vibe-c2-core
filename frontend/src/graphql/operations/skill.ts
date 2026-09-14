import { graphql } from "@/graphql/gql"

// The agent skill's version history. Static for the life of the server
// process; the SPA compares it against `me.skillDownloadedVersion` to decide
// whether to prompt for a re-download and what to say changed.
export const SkillChangelogQuery = graphql(`
  query SkillChangelog {
    skillChangelog {
      currentVersion
      releases {
        version
        date
        notes
      }
    }
  }
`)

// Dismisses the update prompt for one release. Scoped to the JWT user; the
// server refuses versions ahead of the current one.
export const SnoozeSkillUpdateMutation = graphql(`
  mutation SnoozeSkillUpdate($version: Int!) {
    snoozeSkillUpdate(version: $version) {
      id
      skillUpdateSnoozedVersion
    }
  }
`)
