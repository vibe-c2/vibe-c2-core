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

// Deletes a skill outright: every stored bundle, every version, everyone's
// record of having downloaded it, and the name. There is no undo.
export const RemoveSkillMutation = graphql(`
  mutation RemoveSkill($name: String!) {
    removeSkill(name: $name) {
      id
      name
    }
  }
`)

// Real-time registry changes: a skill published, a new version, a removal.
// The payload is thin on purpose; the page refetches, because the part that
// differs per viewer is whether they hold the current version.
export const SkillChangedSubscription = graphql(`
  subscription SkillChanged {
    skillChanged {
      action
      skillId
      name
    }
  }
`)
