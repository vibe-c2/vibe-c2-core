// Decides which community skills an operator should be told about, and reuses
// the built-in skill's decision rules rather than inventing a second set.
//
// Pure so it can be tested without a DOM; the dialog renders the result.

import { decideSkillUpdate, type SkillRelease } from "./skill-update"

// The shape the registry query returns, narrowed to what this file reads.
export interface CommunitySkill {
  name: string
  description: string
  ownerUsername: string
  currentVersion: number
  updatedAt: string
  downloadedVersion?: number | null
  snoozedVersion?: number | null
}

export interface OutdatedSkill {
  name: string
  description: string
  ownerUsername: string
  // The version the operator holds, and the one they could have.
  installedVersion: number
  currentVersion: number
  // How many versions they are behind. Worth showing: one is an update,
  // several is a skill that has moved on without them.
  behind: number
  updatedAt: string
}

/**
 * The skills this operator has downloaded and that have since moved on.
 *
 * A skill they never downloaded is not news: prompting about one would be
 * advertising rather than a notification. Ordered by how far behind they are,
 * so the most stale is first.
 */
export function findOutdatedSkills(skills: CommunitySkill[]): OutdatedSkill[] {
  return skills
    .filter((skill) => isOutdated(skill))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      ownerUsername: skill.ownerUsername,
      installedVersion: skill.downloadedVersion ?? 0,
      currentVersion: skill.currentVersion,
      behind: skill.currentVersion - (skill.downloadedVersion ?? 0),
      updatedAt: skill.updatedAt,
    }))
    .sort((a, b) => b.behind - a.behind || a.name.localeCompare(b.name))
}

/**
 * The subset worth interrupting somebody for: outdated and not dismissed.
 *
 * Separate from findOutdatedSkills because the two drive different things. A
 * dismissed skill keeps its badge on the page, which is a fact the operator
 * can act on when they choose; only an undismissed one opens a dialog.
 */
export function findSkillsToPromptFor(skills: CommunitySkill[]): OutdatedSkill[] {
  const undismissed = skills.filter(
    (skill) => !isSnoozed(skill) && isOutdated(skill),
  )
  return findOutdatedSkills(undismissed)
}

function isOutdated(skill: CommunitySkill): boolean {
  return decide(skill).outdated
}

function isSnoozed(skill: CommunitySkill): boolean {
  const decision = decide(skill)
  return decision.outdated && !decision.show
}

// Each community skill is run through the same decision the built-in skill
// uses. A version row stands in for a release: there is one number, one date
// and, when the publisher wrote one, one line about what changed.
function decide(skill: CommunitySkill) {
  return decideSkillUpdate({
    currentVersion: skill.currentVersion,
    releases: [releaseFor(skill)],
    downloadedVersion: skill.downloadedVersion,
    snoozedVersion: skill.snoozedVersion,
  })
}

function releaseFor(skill: CommunitySkill): SkillRelease {
  return {
    version: skill.currentVersion,
    date: skill.updatedAt,
    notes: [],
  }
}

/**
 * Turns a skill's version history into the release list the built-in prompt
 * renders, newest first. A version with no note still gets a line, because an
 * empty entry reads as a rendering bug rather than as silence.
 */
export function versionsAsReleases(
  versions: { version: number; uploadedAt: string; notes: string }[],
): SkillRelease[] {
  return [...versions]
    .sort((a, b) => b.version - a.version)
    .map((version) => ({
      version: version.version,
      date: version.uploadedAt,
      notes: [version.notes.trim() || "The publisher did not say what changed."],
    }))
}
