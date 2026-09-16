import { DownloadIcon, ShieldCheckIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMe } from "@/graphql/hooks/users"
import {
  useMarkSkillDownloaded,
  useSkillChangelog,
} from "@/graphql/hooks/skill"
import { SKILL_DOWNLOAD_URL } from "@/constants/skill"

/**
 * The generated skill, on the same page as the published ones.
 *
 * It keeps its own state: it has no stored bundle, its version comes from the
 * server's changelog, and the operator's download and snooze live on their
 * user record. Listing it here is presentation, not a merge of the two
 * systems — the built-in prompt is untouched.
 */
export function BuiltinSkillCard() {
  const { data: me } = useMe()
  const { data: changelog } = useSkillChangelog()
  const markDownloaded = useMarkSkillDownloaded()

  const current = changelog?.skillChangelog.currentVersion ?? null
  const installed = me?.me?.skillDownloadedVersion ?? null
  const outdated = current != null && installed != null && installed < current

  function handleDownload() {
    if (current != null) markDownloaded(current)
  }

  return (
    <article className="rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary/80" />
        <h3 className="font-medium leading-tight">vibe-c2</h3>
        {current != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            v{current}
          </span>
        )}
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
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        The tools, the data model and how to work here. Generated from this
        server on every download, so it always matches the tools you have.
      </p>

      <p className="mt-1.5 text-xs text-muted-foreground">
        Maintained with the platform. Updated whenever the tools change.
      </p>

      <div className="mt-3">
        <Button
          size="sm"
          variant={outdated ? "default" : "outline"}
          onClick={handleDownload}
          render={<a href={SKILL_DOWNLOAD_URL} download />}
        >
          <DownloadIcon className="size-4" />
          {outdated ? "Update" : "Download"}
        </Button>
      </div>
    </article>
  )
}
