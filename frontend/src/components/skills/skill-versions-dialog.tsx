import { BotIcon, DownloadIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { Skeleton } from "@/components/ui/skeleton"
import { useSkillVersions } from "@/graphql/hooks/skills"
import { useSkillStore } from "@/stores/skills"
import { formatBytes } from "@/lib/skill-upload"

/**
 * A skill's history, newest first, with every version downloadable.
 *
 * This is the point of keeping versions at all: an operator whose agent
 * started behaving oddly after an update can read what changed and go back to
 * the one that worked, and a skill that quietly changed character can be read
 * against what it used to say.
 */
export function SkillVersionsDialog() {
  const open = useSkillStore((s) => s.versionsDialogOpen)
  const skill = useSkillStore((s) => s.selectedSkill)
  const closeDialogs = useSkillStore((s) => s.closeDialogs)

  const name = skill?.name ?? ""
  const { data, isLoading } = useSkillVersions(name, open && name !== "")
  const versions = data?.skillVersions ?? []
  const downloadUrl = `/api/v1/skills/${name}/download`

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeDialogs() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            Every version stays downloadable. Nothing here is ever overwritten.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history.</p>
        ) : (
          <ol className="max-h-[50vh] space-y-3 overflow-y-auto">
            {versions.map((version) => (
              <li
                key={version.version}
                className="border-l-2 border-border/70 pl-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <a
                    href={`${downloadUrl}?version=${version.version}`}
                    download
                    className="inline-flex items-center gap-1 text-sm font-medium tabular-nums underline-offset-2 hover:underline"
                  >
                    <DownloadIcon className="size-3" />v{version.version}
                  </a>
                  <FormattedDateTimeText
                    date={version.uploadedAt}
                    className="text-muted-foreground"
                  />
                  <span className="text-muted-foreground">
                    {version.uploadedByUsername}
                  </span>
                  {version.viaAgent && (
                    <span
                      title="Published by an agent on their behalf"
                      className="inline-flex items-center text-muted-foreground"
                    >
                      <BotIcon className="size-3" />
                    </span>
                  )}
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {formatBytes(version.sizeBytes)}
                  </span>
                </div>
                {version.notes && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {version.notes}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
