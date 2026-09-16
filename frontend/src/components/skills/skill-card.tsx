import { useState } from "react"
import {
  ChevronDownIcon,
  DownloadIcon,
  HistoryIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { SkillVersionList } from "@/components/skills/skill-version-list"
import { useMarkSkillDownloaded, useUnpublishSkill } from "@/graphql/hooks/skills"
import { formatBytes } from "@/lib/skill-upload"
import { cn } from "@/lib/utils"

export interface SkillCardSkill {
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
}

interface SkillCardProps {
  skill: SkillCardSkill
  /** Administrators may retire any skill; authors may retire their own. */
  canRetire: boolean
  onPublishNewVersion: (name: string) => void
}

/**
 * One community skill.
 *
 * The publisher is shown as prominently as the name, because who wrote a
 * skill is the only thing an operator has to go on when deciding whether to
 * let their agent follow it. Nothing here renders the bundle's contents.
 */
export function SkillCard({
  skill,
  canRetire,
  onPublishNewVersion,
}: SkillCardProps) {
  const [showHistory, setShowHistory] = useState(false)
  const markDownloaded = useMarkSkillDownloaded()
  const unpublish = useUnpublishSkill()

  const installed = skill.downloadedVersion ?? null
  const outdated = installed != null && installed < skill.currentVersion

  function handleDownload() {
    markDownloaded(skill.name, skill.currentVersion)
  }

  function handleRetire() {
    unpublish.mutate(skill.name, {
      onSuccess: () => toast.success(`Retired ${skill.name}.`),
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : `Could not retire ${skill.name}.`,
        ),
    })
  }

  return (
    <article
      className={cn(
        "rounded-lg border bg-card px-4 py-3 transition-colors",
        outdated && "border-primary/40",
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <h3 className="font-medium leading-tight">{skill.name}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          v{skill.currentVersion}
        </span>
        {outdated && (
          <Badge variant="secondary" className="text-[10px]">
            Update available
          </Badge>
        )}
        {installed != null && !outdated && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            installed
          </span>
        )}
        {skill.mine && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            yours
          </span>
        )}
      </div>

      {skill.description && (
        <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          by <span className="text-foreground">{skill.ownerUsername}</span>
        </span>
        <FormattedDateTimeText date={skill.updatedAt} />
        <span className="tabular-nums">{formatBytes(skill.sizeBytes)}</span>
        {outdated && (
          <span>
            you have v{installed}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={outdated ? "default" : "outline"}
          onClick={handleDownload}
          render={<a href={skill.downloadUrl} download />}
        >
          <DownloadIcon className="size-4" />
          {outdated ? "Update" : "Download"}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowHistory((open) => !open)}
        >
          <HistoryIcon className="size-4" />
          {skill.currentVersion === 1 ? "History" : `${skill.currentVersion} versions`}
          <ChevronDownIcon
            className={cn("size-3 transition-transform", showHistory && "rotate-180")}
          />
        </Button>

        {skill.mine && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPublishNewVersion(skill.name)}
          >
            <UploadIcon className="size-4" />
            New version
          </Button>
        )}

        {canRetire && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            disabled={unpublish.isPending}
            onClick={handleRetire}
          >
            <Trash2Icon className="size-4" />
            Retire
          </Button>
        )}
      </div>

      <SkillVersionList
        name={skill.name}
        downloadUrl={skill.downloadUrl}
        currentVersion={skill.currentVersion}
        open={showHistory}
      />
    </article>
  )
}
