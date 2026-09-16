import { useMemo } from "react"
import { PackageIcon } from "lucide-react"
import { useMe } from "@/graphql/hooks/users"
import { useSkillChangelog } from "@/graphql/hooks/skill"
import { useSkillRegistry } from "@/graphql/hooks/skills"
import { useSkillStore } from "@/stores/skills"
import { useAuthStore } from "@/stores/auth"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { SkillsToolbar } from "@/components/skills/skills-toolbar"
import { SkillsTable } from "@/components/skills/skills-table"
import { PublishSkillDialog } from "@/components/skills/publish-skill-dialog"
import { SkillVersionsDialog } from "@/components/skills/skill-versions-dialog"
import { RetireSkillDialog } from "@/components/skills/retire-skill-dialog"
import {
  buildSkillRows,
  filterSkillRows,
  sortSkillRows,
} from "@/lib/skill-rows"

/**
 * Every skill on this server in one table: the built-in one and the ones
 * operators publish to each other.
 *
 * They are listed together because an operator scanning the page asks the
 * same questions of both — what is it, who stands behind it, do I have the
 * current one — and answering those in two different layouts would make the
 * comparison harder, not easier. What differs is accountability, so the
 * author column carries it and the toolbar can filter on it.
 */
export function SkillsPage() {
  usePageMetadata({
    title: "Skills",
    icon: { kind: "lucide", component: PackageIcon },
  })

  const search = useSkillStore((s) => s.search)
  const originFilter = useSkillStore((s) => s.originFilter)
  const sort = useSkillStore((s) => s.sort)
  const setSort = useSkillStore((s) => s.setSort)
  const publishDialogOpen = useSkillStore((s) => s.publishDialogOpen)
  const publishTargetName = useSkillStore((s) => s.publishTargetName)
  const setPublishDialogOpen = useSkillStore((s) => s.setPublishDialogOpen)

  // The wildcard role, the same check the wiki trash panel makes. An admin can
  // retire any skill; an author can retire their own.
  const isAdmin = useAuthStore(
    (state) => state.user?.roles.includes("admin") ?? false,
  )

  const { data: registry, isLoading } = useSkillRegistry()
  const { data: changelog } = useSkillChangelog()
  const { data: me } = useMe()

  const skills = useMemo(() => {
    const rows = buildSkillRows(
      {
        currentVersion: changelog?.skillChangelog.currentVersion,
        installedVersion: me?.me?.skillDownloadedVersion,
      },
      registry?.skillRegistry.skills ?? [],
    )
    return sortSkillRows(filterSkillRows(rows, search, originFilter), sort)
  }, [registry, changelog, me, search, originFilter, sort])

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <SkillsToolbar />
      <SkillsTable
        skills={skills}
        isLoading={isLoading}
        isAdmin={isAdmin}
        sort={sort}
        onSortChange={setSort}
      />
      <PublishSkillDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        existingName={publishTargetName}
        maxUploadBytes={registry?.skillRegistry.maxUploadBytes ?? 0}
      />
      <SkillVersionsDialog />
      <RetireSkillDialog />
    </div>
  )
}
