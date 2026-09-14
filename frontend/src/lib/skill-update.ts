// Decides whether to prompt an operator to re-download the agent skill, and
// what to tell them changed. Pure so it can be tested without a DOM; the
// dialog just renders the result.

export interface SkillRelease {
  version: number
  date: string
  notes: string[]
}

export interface SkillUpdateInput {
  // What the server currently hands out.
  currentVersion: number
  // Every release the server knows about, any order.
  releases: SkillRelease[]
  // The release the operator last downloaded; null when never.
  downloadedVersion: number | null | undefined
  // The newest release they dismissed the prompt for; null when none.
  snoozedVersion: number | null | undefined
}

export interface SkillUpdateDecision {
  // True when the prompt should be shown right now.
  show: boolean
  // True when the installed copy is behind, regardless of snoozing. Drives
  // the quiet "update available" badge that survives a dismissal.
  outdated: boolean
  // Releases newer than the installed one, newest first — what the prompt
  // lists. Empty when not outdated.
  pending: SkillRelease[]
}

export function decideSkillUpdate(input: SkillUpdateInput): SkillUpdateDecision {
  const { currentVersion, releases, downloadedVersion, snoozedVersion } = input

  // Never downloaded: nothing installed to be out of date. Prompting here
  // would nag people who do not use an agent at all.
  if (downloadedVersion == null) {
    return { show: false, outdated: false, pending: [] }
  }

  const outdated = downloadedVersion < currentVersion
  if (!outdated) {
    return { show: false, outdated: false, pending: [] }
  }

  const pending = releases
    .filter((r) => r.version > downloadedVersion)
    .sort((a, b) => b.version - a.version)

  // A snooze covers every release up to the one dismissed. The prompt comes
  // back only when something newer than that ships.
  const snoozed = snoozedVersion != null && snoozedVersion >= currentVersion

  return { show: !snoozed, outdated, pending }
}
