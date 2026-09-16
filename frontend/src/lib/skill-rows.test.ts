import { describe, expect, it } from "vitest"
import {
  buildSkillRows,
  filterSkillRows,
  sortSkillRows,
  type CommunitySkillInput,
} from "./skill-rows"

function community(
  overrides: Partial<CommunitySkillInput> = {},
): CommunitySkillInput {
  return {
    id: "1",
    name: "recon-sweep",
    description: "sweeps a subnet",
    ownerUsername: "alice",
    currentVersion: 2,
    updatedAt: "2026-09-16T10:00:00Z",
    sizeBytes: 400,
    mine: false,
    downloadedVersion: null,
    downloadUrl: "/api/v1/skills/recon-sweep/download",
    ...overrides,
  }
}

describe("buildSkillRows", () => {
  it("puts the built-in skill and the published ones in one shape", () => {
    const rows = buildSkillRows({ currentVersion: 12, installedVersion: 11 }, [
      community(),
    ])
    expect(rows.map((r) => r.origin)).toEqual(["builtin", "community"])
    expect(rows[0].name).toBe("vibe-c2")
    expect(rows[0].author).toBe("")
    expect(rows[0].sizeBytes).toBeNull()
  })

  it("omits the built-in row until the changelog has loaded", () => {
    const rows = buildSkillRows({ currentVersion: null, installedVersion: 3 }, [])
    expect(rows).toEqual([])
  })

  it("marks an installed copy that is behind as outdated", () => {
    const rows = buildSkillRows({ currentVersion: 12, installedVersion: 11 }, [
      community({ downloadedVersion: 1, currentVersion: 2 }),
    ])
    expect(rows.every((r) => r.outdated)).toBe(true)
  })

  it("does not call a skill that was never downloaded outdated", () => {
    const rows = buildSkillRows({ currentVersion: 12, installedVersion: null }, [
      community({ downloadedVersion: null }),
    ])
    expect(rows.some((r) => r.outdated)).toBe(false)
  })

  it("treats a newer installed copy as current", () => {
    const rows = buildSkillRows({ currentVersion: 12, installedVersion: 13 }, [])
    expect(rows[0].outdated).toBe(false)
  })
})

describe("filterSkillRows", () => {
  const rows = buildSkillRows({ currentVersion: 12, installedVersion: 12 }, [
    community({ id: "1", name: "recon-sweep", ownerUsername: "alice" }),
    community({
      id: "2",
      name: "report-style",
      description: "house reporting style",
      ownerUsername: "bob",
    }),
  ])

  it("matches on name, description and author", () => {
    expect(filterSkillRows(rows, "recon", null).map((r) => r.name)).toEqual([
      "recon-sweep",
    ])
    expect(filterSkillRows(rows, "reporting", null).map((r) => r.name)).toEqual([
      "report-style",
    ])
    expect(filterSkillRows(rows, "bob", null).map((r) => r.name)).toEqual([
      "report-style",
    ])
  })

  it("ignores case and surrounding space", () => {
    expect(filterSkillRows(rows, "  ALICE ", null)).toHaveLength(1)
  })

  it("narrows to one origin", () => {
    expect(filterSkillRows(rows, "", "builtin").map((r) => r.name)).toEqual([
      "vibe-c2",
    ])
    expect(filterSkillRows(rows, "", "community")).toHaveLength(2)
  })

  it("returns everything when nothing is asked for", () => {
    expect(filterSkillRows(rows, "", null)).toHaveLength(3)
  })
})

describe("sortSkillRows", () => {
  const rows = buildSkillRows({ currentVersion: 12, installedVersion: 12 }, [
    community({
      id: "1",
      name: "recon-sweep",
      ownerUsername: "bob",
      currentVersion: 5,
      updatedAt: "2026-09-16T10:00:00Z",
    }),
    community({
      id: "2",
      name: "aaa-first",
      ownerUsername: "alice",
      currentVersion: 1,
      updatedAt: "2026-09-01T10:00:00Z",
    }),
  ])

  it("sorts by name in both directions", () => {
    expect(
      sortSkillRows(rows, { field: "NAME", direction: "ASC" }).map((r) => r.name),
    ).toEqual(["aaa-first", "recon-sweep", "vibe-c2"])
    expect(
      sortSkillRows(rows, { field: "NAME", direction: "DESC" }).map((r) => r.name),
    ).toEqual(["vibe-c2", "recon-sweep", "aaa-first"])
  })

  it("sorts by version", () => {
    expect(
      sortSkillRows(rows, { field: "VERSION", direction: "DESC" }).map(
        (r) => r.currentVersion,
      ),
    ).toEqual([12, 5, 1])
  })

  it("anchors the built-in skill when sorting by author, which it has none of", () => {
    const ascending = sortSkillRows(rows, { field: "AUTHOR", direction: "ASC" })
    expect(ascending[0].name).toBe("vibe-c2")
    const descending = sortSkillRows(rows, { field: "AUTHOR", direction: "DESC" })
    expect(descending[descending.length - 1].name).toBe("vibe-c2")
  })

  it("anchors it the same way when sorting by upload time, which it has none of", () => {
    const newestFirst = sortSkillRows(rows, {
      field: "UPDATED",
      direction: "DESC",
    })
    expect(newestFirst.map((r) => r.name)).toEqual([
      "recon-sweep",
      "aaa-first",
      "vibe-c2",
    ])
  })

  it("leaves the input untouched", () => {
    const before = rows.map((r) => r.name)
    sortSkillRows(rows, { field: "NAME", direction: "DESC" })
    expect(rows.map((r) => r.name)).toEqual(before)
  })
})
