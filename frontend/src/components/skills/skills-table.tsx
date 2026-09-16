import {
  DownloadIcon,
  EllipsisIcon,
  HistoryIcon,
  PackageIcon,
  ShieldCheckIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { SortableHeader } from "@/components/ui/sortable-header"
import {
  VirtualizedDataTable,
  dataTableRowClass,
} from "@/components/ui/virtualized-data-table"
import { useMarkSkillDownloaded } from "@/graphql/hooks/skills"
import { useMarkSkillDownloaded as useMarkBuiltinDownloaded } from "@/graphql/hooks/skill"
import { useSkillStore } from "@/stores/skills"
import { formatBytes } from "@/lib/skill-upload"
import type { DataTableSort } from "@/lib/data-table-sort"
import type { SkillRow, SkillSortField } from "@/lib/skill-rows"

interface SkillsTableProps {
  skills: SkillRow[]
  isLoading: boolean
  /** An administrator may retire any skill; an author may retire their own. */
  isAdmin: boolean
  sort: DataTableSort<SkillSortField>
  onSortChange: (next: DataTableSort<SkillSortField>) => void
}

const GRID_COLS = "grid-cols-[2fr_1fr_80px_160px_90px_150px_48px]"

export function SkillsTable({
  skills,
  isLoading,
  isAdmin,
  sort,
  onSortChange,
}: SkillsTableProps) {
  const openVersionsDialog = useSkillStore((s) => s.openVersionsDialog)
  const openRetireDialog = useSkillStore((s) => s.openRetireDialog)
  const openPublishDialog = useSkillStore((s) => s.openPublishDialog)
  const markDownloaded = useMarkSkillDownloaded()
  const markBuiltinDownloaded = useMarkBuiltinDownloaded()

  // The two origins record a download in different places: the built-in skill
  // against the user record, a published one against its subscription row.
  function handleDownload(skill: SkillRow) {
    if (skill.origin === "builtin") {
      markBuiltinDownloaded(skill.currentVersion)
      return
    }
    markDownloaded(skill.name, skill.currentVersion)
  }

  return (
    <VirtualizedDataTable
      items={skills}
      isLoading={isLoading}
      // The registry is small and unpaginated — there is no next page.
      isFetchingNextPage={false}
      hasNextPage={false}
      fetchNextPage={() => {}}
      gridCols={GRID_COLS}
      entityNoun="skills"
      header={
        <>
          <SortableHeader
            label="Name"
            field="NAME"
            sort={sort}
            onSortChange={onSortChange}
          />
          <SortableHeader
            label="Author"
            field="AUTHOR"
            sort={sort}
            onSortChange={onSortChange}
          />
          <SortableHeader
            label="Version"
            field="VERSION"
            sort={sort}
            onSortChange={onSortChange}
          />
          <div>Installed</div>
          <div>Size</div>
          <SortableHeader
            label="Updated"
            field="UPDATED"
            sort={sort}
            onSortChange={onSortChange}
            initialDirection="DESC"
          />
          <div />
        </>
      }
      emptyState={
        <>
          <PackageIcon className="size-8 opacity-50" />
          <p className="text-sm">No skills found.</p>
        </>
      }
      renderRow={(skill) => {
        const canRetire = skill.origin === "community" && (skill.mine || isAdmin)
        return (
          <div className={dataTableRowClass(GRID_COLS)}>
            <div className="min-w-0">
              <div className="truncate font-medium">{skill.name}</div>
              {skill.description && (
                <div className="truncate text-xs text-muted-foreground">
                  {skill.description}
                </div>
              )}
            </div>

            <div className="min-w-0">
              {skill.origin === "builtin" ? (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheckIcon className="size-3" />
                  Built in
                </Badge>
              ) : (
                <div className="flex items-baseline gap-1.5 text-sm">
                  <span className="truncate">{skill.author}</span>
                  {skill.mine && (
                    <span className="text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
              )}
            </div>

            <div className="text-sm tabular-nums text-muted-foreground">
              v{skill.currentVersion}
            </div>

            <div>
              <InstalledCell skill={skill} />
            </div>

            <div className="text-sm tabular-nums text-muted-foreground">
              {skill.sizeBytes == null ? "—" : formatBytes(skill.sizeBytes)}
            </div>

            <div className="text-sm text-muted-foreground">
              {skill.updatedAt ? (
                <FormattedDateTimeText date={skill.updatedAt} />
              ) : (
                "—"
              )}
            </div>

            <div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" />}
                >
                  <EllipsisIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleDownload(skill)}
                    render={<a href={skill.downloadUrl} download />}
                  >
                    <DownloadIcon className="size-4" />
                    {skill.outdated ? "Update" : "Download"}
                  </DropdownMenuItem>
                  {skill.origin === "community" && (
                    <DropdownMenuItem
                      onClick={() => openVersionsDialog({ name: skill.name })}
                    >
                      <HistoryIcon className="size-4" />
                      Version history
                    </DropdownMenuItem>
                  )}
                  {skill.mine && (
                    <DropdownMenuItem
                      onClick={() => openPublishDialog(skill.name)}
                    >
                      <UploadIcon className="size-4" />
                      Publish new version
                    </DropdownMenuItem>
                  )}
                  {canRetire && (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => openRetireDialog({ name: skill.name })}
                    >
                      <TrashIcon className="size-4" />
                      Retire
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      }}
    />
  )
}

// What this operator holds. The three states are meaningfully different: an
// update they should take, a copy that is current, and a skill they have
// never installed and so are not behind on.
function InstalledCell({ skill }: { skill: SkillRow }) {
  if (skill.outdated) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
        <span className="size-2 rounded-full bg-amber-600 dark:bg-amber-400" />
        v{skill.installedVersion} · update
      </span>
    )
  }
  if (skill.installedVersion != null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
        <span className="size-2 rounded-full bg-green-600 dark:bg-green-400" />
        v{skill.installedVersion}
      </span>
    )
  }
  return <span className="text-sm text-muted-foreground">—</span>
}
