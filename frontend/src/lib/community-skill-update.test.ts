import { describe, expect, it } from "vitest"
import {
  findOutdatedSkills,
  findSkillsToPromptFor,
  versionsAsReleases,
  type CommunitySkill,
} from "./community-skill-update"

function skill(overrides: Partial<CommunitySkill> = {}): CommunitySkill {
  return {
    name: "recon-sweep",
    description: "sweeps a subnet",
    ownerUsername: "alice",
    currentVersion: 2,
    updatedAt: "2026-09-16T10:00:00Z",
    downloadedVersion: 1,
    snoozedVersion: null,
    ...overrides,
  }
}

describe("findOutdatedSkills", () => {
  it("reports a downloaded skill that has moved on", () => {
    const outdated = findOutdatedSkills([skill()])
    expect(outdated).toHaveLength(1)
    expect(outdated[0].installedVersion).toBe(1)
    expect(outdated[0].currentVersion).toBe(2)
    expect(outdated[0].behind).toBe(1)
  })

  it("ignores a skill the operator never downloaded", () => {
    expect(findOutdatedSkills([skill({ downloadedVersion: null })])).toEqual([])
  })

  it("ignores a skill the operator already has", () => {
    expect(
      findOutdatedSkills([skill({ downloadedVersion: 2, currentVersion: 2 })]),
    ).toEqual([])
  })

  it("treats a newer installed copy as current rather than behind", () => {
    expect(
      findOutdatedSkills([skill({ downloadedVersion: 3, currentVersion: 2 })]),
    ).toEqual([])
  })

  it("still reports a dismissed skill, so its badge survives the dismissal", () => {
    const outdated = findOutdatedSkills([skill({ snoozedVersion: 2 })])
    expect(outdated).toHaveLength(1)
  })

  it("puts the most stale skill first, then orders by name", () => {
    const outdated = findOutdatedSkills([
      skill({ name: "b-skill", downloadedVersion: 1, currentVersion: 2 }),
      skill({ name: "far-behind", downloadedVersion: 1, currentVersion: 9 }),
      skill({ name: "a-skill", downloadedVersion: 1, currentVersion: 2 }),
    ])
    expect(outdated.map((s) => s.name)).toEqual(["far-behind", "a-skill", "b-skill"])
  })
})

describe("findSkillsToPromptFor", () => {
  it("prompts for an outdated skill that was not dismissed", () => {
    expect(findSkillsToPromptFor([skill()]).map((s) => s.name)).toEqual([
      "recon-sweep",
    ])
  })

  it("stays quiet about a skill dismissed at the current version", () => {
    expect(findSkillsToPromptFor([skill({ snoozedVersion: 2 })])).toEqual([])
  })

  it("comes back when something newer than the dismissal ships", () => {
    const prompts = findSkillsToPromptFor([
      skill({ snoozedVersion: 2, currentVersion: 3 }),
    ])
    expect(prompts).toHaveLength(1)
    expect(prompts[0].currentVersion).toBe(3)
  })

  it("returns nothing for an empty registry", () => {
    expect(findSkillsToPromptFor([])).toEqual([])
  })
})

describe("versionsAsReleases", () => {
  it("orders newest first and keeps the publisher's note", () => {
    const releases = versionsAsReleases([
      { version: 1, uploadedAt: "2026-09-01T00:00:00Z", notes: "first cut" },
      { version: 2, uploadedAt: "2026-09-16T00:00:00Z", notes: "skips known hosts" },
    ])
    expect(releases.map((r) => r.version)).toEqual([2, 1])
    expect(releases[0].notes).toEqual(["skips known hosts"])
  })

  it("stands in for a missing note rather than rendering an empty line", () => {
    const releases = versionsAsReleases([
      { version: 1, uploadedAt: "2026-09-01T00:00:00Z", notes: "   " },
    ])
    expect(releases[0].notes[0]).toContain("did not say")
  })
})
