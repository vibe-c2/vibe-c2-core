import { graphql } from "@/graphql/gql"

// The community skill registry: what has been published, and what this
// operator has already downloaded or dismissed. One query rather than a
// listing plus a per-skill state lookup, because the page needs both at once.
export const SkillRegistryQuery = graphql(`
  query SkillRegistry {
    skillRegistry {
      maxUploadBytes
      skills {
        id
        name
        description
        ownerUserId
        ownerUsername
        currentVersion
        updatedAt
        sizeBytes
        mine
        downloadedVersion
        downloadedAt
        snoozedVersion
        downloadUrl
      }
    }
  }
`)

// One skill's history. Fetched on demand, when an operator opens the version
// list on a card, rather than with every listing.
export const SkillVersionsQuery = graphql(`
  query SkillVersions($name: String!) {
    skillVersions(name: $name) {
      version
      uploadedAt
      uploadedByUsername
      sizeBytes
      notes
      viaAgent
    }
  }
`)

// Dismisses the update prompt for one skill until something newer ships.
export const SnoozeSkillMutation = graphql(`
  mutation SnoozeSkill($name: String!, $version: Int!) {
    snoozeSkill(name: $name, version: $version) {
      id
      snoozedVersion
    }
  }
`)

// Retires a skill: it stops being listed and downloaded, the name stays
// claimed, and the versions are kept. The author or an administrator.
export const UnpublishSkillMutation = graphql(`
  mutation UnpublishSkill($name: String!) {
    unpublishSkill(name: $name) {
      id
      name
    }
  }
`)
