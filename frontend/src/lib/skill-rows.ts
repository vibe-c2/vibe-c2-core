// Turns the two sources of skills into the single row shape the skills table
// renders, and does the filtering and sorting over it.
//
// The built-in skill and a published one come from different places — one is
// generated per request and tracked on the user record, the other is stored
// with a version history — but an operator scanning the page is asking the
// same questions of both: what is it, who stands behind it, do I have the
// current one. One row type is what lets the table answer that in one place.
//
// Pure, so the table stays a rendering concern and this is what gets tested.

import { SKILL_DOWNLOAD_URL } from "@/constants/skill"
import type { DataTableSort } from "@/lib/data-table-sort"

export type SkillOrigin = "builtin" | "community"

export type SkillSortField = "NAME" | "AUTHOR" | "VERSION" | "UPDATED"

export type SkillOriginFilter = null | SkillOrigin

export interface SkillRow {
  id: string
  origin: SkillOrigin
  name: string
  description: string
  /** The publisher's username. Empty for the built-in skill, which has none. */
  author: string
  currentVersion: number
  /** What this operator downloaded, null when they never have. */
  installedVersion: number | null
  /** Null for the built-in skill: it is generated per request, not stored. */
  sizeBytes: number | null
  updatedAt: string | null
  downloadUrl: string
  /** True when the caller published it, so they can add a version to it. */
  mine: boolean
  /** Retired: unlisted and not handed out, name and history kept. */
  unpublished: boolean
  /** This viewer may bring it back. */
  canRestore: boolean
  /** They hold a copy and it is behind. Never true when nothing is installed. */
  outdated: boolean
}

export interface BuiltinSkillInput {
  currentVersion: number | null | undefined
  installedVersion: number | null | undefined
}

export interface CommunitySkillInput {
  id: string
  name: string
  description: string
  ownerUsername: string
  currentVersion: number
  updatedAt: string
  sizeBytes: number
  mine: boolean
  downloadedVersion?: number | null
  downloadUrl: string
  unpublished: boolean
  canRestore: boolean
}

/** The name the generated skill is published under, and the one nobody else
 *  may claim. Mirrors SkillName in core/pkg/mcp/skill.go. */
export const BUILTIN_SKILL_NAME = "vibe-c2"

const BUILTIN_DESCRIPTION =
  "The tools, the data model and how to work here. Generated from this server, so it always matches the tools you have."

export function buildSkillRows(
  builtin: BuiltinSkillInput,
  community: CommunitySkillInput[],
): SkillRow[] {
  const rows: SkillRow[] = []

  // Only once the changelog has loaded. A row claiming version 0 would read
  // as a real fact rather than as a pending request.
  if (builtin.currentVersion != null) {
    const installed = builtin.installedVersion ?? null
    rows.push({
      id: "builtin",
      origin: "builtin",
      name: BUILTIN_SKILL_NAME,
      description: BUILTIN_DESCRIPTION,
      author: "",
      currentVersion: builtin.currentVersion,
      installedVersion: installed,
      sizeBytes: null,
      updatedAt: null,
      downloadUrl: SKILL_DOWNLOAD_URL,
      mine: false,
      unpublished: false,
      canRestore: false,
      outdated: installed != null && installed < builtin.currentVersion,
    })
  }

  for (const skill of community) {
    const installed = skill.downloadedVersion ?? null
    rows.push({
      id: skill.id,
      origin: "community",
      name: skill.name,
      description: skill.description,
      author: skill.ownerUsername,
      currentVersion: skill.currentVersion,
      installedVersion: installed,
      sizeBytes: skill.sizeBytes,
      updatedAt: skill.updatedAt,
      downloadUrl: skill.downloadUrl,
      mine: skill.mine,
      unpublished: skill.unpublished,
      canRestore: skill.canRestore,
      outdated: installed != null && installed < skill.currentVersion,
    })
  }

  return rows
}

export function filterSkillRows(
  rows: SkillRow[],
  search: string,
  origin: SkillOriginFilter,
): SkillRow[] {
  const query = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (origin != null && row.origin !== origin) return false
    if (!query) return true
    return (
      row.name.toLowerCase().includes(query) ||
      row.description.toLowerCase().includes(query) ||
      row.author.toLowerCase().includes(query)
    )
  })
}

export function sortSkillRows(
  rows: SkillRow[],
  sort: DataTableSort<SkillSortField>,
): SkillRow[] {
  const factor = sort.direction === "ASC" ? 1 : -1
  return [...rows].sort((a, b) => compare(a, b, sort.field) * factor)
}

function compare(a: SkillRow, b: SkillRow, field: SkillSortField): number {
  switch (field) {
    case "AUTHOR":
      // The built-in skill has no author. Sorting it to the top either way
      // keeps it where an operator expects to find it rather than burying it
      // under whichever username happens to sort first.
      if (a.author === "" || b.author === "") {
        return a.author === b.author ? 0 : a.author === "" ? -1 : 1
      }
      return a.author.localeCompare(b.author) || a.name.localeCompare(b.name)
    case "VERSION":
      return a.currentVersion - b.currentVersion || a.name.localeCompare(b.name)
    case "UPDATED":
      // Same reasoning: the built-in skill has no upload time, so it anchors
      // rather than sorting as if it were infinitely old.
      if (a.updatedAt == null || b.updatedAt == null) {
        return a.updatedAt === b.updatedAt ? 0 : a.updatedAt == null ? -1 : 1
      }
      return a.updatedAt.localeCompare(b.updatedAt) || a.name.localeCompare(b.name)
    case "NAME":
    default:
      return a.name.localeCompare(b.name)
  }
}
