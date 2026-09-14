import { describe, expect, it } from "vitest"
import { decideSkillUpdate, type SkillRelease } from "./skill-update"

const releases: SkillRelease[] = [
  { version: 1, date: "2026-09-14", notes: ["first"] },
  { version: 2, date: "2026-09-20", notes: ["second"] },
  { version: 3, date: "2026-10-01", notes: ["third", "and more"] },
]

function decide(overrides: Partial<Parameters<typeof decideSkillUpdate>[0]>) {
  return decideSkillUpdate({
    currentVersion: 3,
    releases,
    downloadedVersion: null,
    snoozedVersion: null,
    ...overrides,
  })
}

describe("decideSkillUpdate", () => {
  it("stays silent for an operator who never downloaded the skill", () => {
    expect(decide({ downloadedVersion: null })).toEqual({ show: false, outdated: false, pending: [] })
    expect(decide({ downloadedVersion: undefined })).toEqual({ show: false, outdated: false, pending: [] })
  })

  it("stays silent when the installed copy is current", () => {
    expect(decide({ downloadedVersion: 3 })).toEqual({ show: false, outdated: false, pending: [] })
  })

  it("treats a copy ahead of the server as current, not outdated", () => {
    // A rollback of the server; nothing sensible to prompt for.
    expect(decide({ downloadedVersion: 9 }).show).toBe(false)
  })

  it("prompts with every skipped release, newest first", () => {
    const d = decide({ downloadedVersion: 1 })
    expect(d.show).toBe(true)
    expect(d.outdated).toBe(true)
    expect(d.pending.map((r) => r.version)).toEqual([3, 2])
  })

  it("lists only what is newer than the installed copy", () => {
    expect(decide({ downloadedVersion: 2 }).pending.map((r) => r.version)).toEqual([3])
  })

  it("hides the prompt once the current release is snoozed", () => {
    const d = decide({ downloadedVersion: 1, snoozedVersion: 3 })
    expect(d.show).toBe(false)
    // Still outdated: the badge keeps saying so after the dialog is dismissed.
    expect(d.outdated).toBe(true)
    expect(d.pending).toHaveLength(2)
  })

  it("brings the prompt back when a release newer than the snooze ships", () => {
    expect(decide({ downloadedVersion: 1, snoozedVersion: 2 }).show).toBe(true)
  })

  it("does not let a stale snooze hide a newer release", () => {
    // Snoozed v2 long ago, then downloaded v2, then v3 shipped.
    expect(decide({ downloadedVersion: 2, snoozedVersion: 2 }).show).toBe(true)
  })

  it("tolerates releases arriving out of order", () => {
    const shuffled = [releases[2], releases[0], releases[1]]
    expect(decide({ downloadedVersion: 1, releases: shuffled }).pending.map((r) => r.version)).toEqual([3, 2])
  })
})
