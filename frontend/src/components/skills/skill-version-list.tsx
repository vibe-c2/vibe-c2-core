import { BotIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useSkillVersions } from "@/graphql/hooks/skills"
import { formatBytes } from "@/lib/skill-upload"

interface SkillVersionListProps {
  name: string
  downloadUrl: string
  currentVersion: number
  /** Only fetched once the operator opens the list. */
  open: boolean
}

/**
 * A skill's history, newest first.
 *
 * Every version stays downloadable, which is the point of showing this at
 * all: an operator whose agent started behaving oddly after an update can
 * read what changed and go back to the version that worked.
 */
export function SkillVersionList({
  name,
  downloadUrl,
  currentVersion,
  open,
}: SkillVersionListProps) {
  const { data, isLoading } = useSkillVersions(name, open)

  if (!open) return null
  if (isLoading) {
    return (
      <div className="space-y-2 pt-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }

  const versions = data?.skillVersions ?? []
  if (versions.length === 0) {
    return <p className="pt-1 text-xs text-muted-foreground">No history.</p>
  }

  return (
    <ol className="space-y-2 pt-1">
      {versions.map((version) => (
        <li
          key={version.version}
          className="border-l-2 border-border/70 pl-3 text-xs"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <a
              href={`${downloadUrl}?version=${version.version}`}
              download
              className="font-medium tabular-nums underline-offset-2 hover:underline"
            >
              v{version.version}
            </a>
            {version.version === currentVersion && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                current
              </span>
            )}
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
                className="inline-flex items-center gap-1 text-muted-foreground"
              >
                <BotIcon className="size-3" />
              </span>
            )}
            <span className="ml-auto text-muted-foreground tabular-nums">
              {formatBytes(version.sizeBytes)}
            </span>
          </div>
          {version.notes && (
            <p className="mt-0.5 text-muted-foreground">{version.notes}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
