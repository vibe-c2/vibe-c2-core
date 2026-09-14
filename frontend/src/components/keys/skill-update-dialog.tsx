import { DownloadIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useMe } from "@/graphql/hooks/users"
import {
  useMarkSkillDownloaded,
  useSkillChangelog,
  useSnoozeSkillUpdate,
} from "@/graphql/hooks/skill"
import { SKILL_DOWNLOAD_URL } from "@/constants/skill"
import { decideSkillUpdate } from "@/lib/skill-update"

/**
 * Prompts the operator to re-download the agent skill when the server is
 * handing out a newer release than the one they installed.
 *
 * Mounted globally so it can appear on any authed surface on first load. It
 * shows at most once per release: dismissing it snoozes that release, and the
 * prompt only returns when something newer ships. Someone who never downloaded
 * the skill is never prompted — decideSkillUpdate enforces all of this, and is
 * unit-tested on its own; this component only renders the decision.
 */
export function SkillUpdateDialog() {
  const { data: me } = useMe()
  const { data: changelog } = useSkillChangelog()
  const snooze = useSnoozeSkillUpdate()
  const markDownloaded = useMarkSkillDownloaded()

  if (!me?.me || !changelog) return null

  const decision = decideSkillUpdate({
    currentVersion: changelog.skillChangelog.currentVersion,
    releases: changelog.skillChangelog.releases,
    downloadedVersion: me.me.skillDownloadedVersion,
    snoozedVersion: me.me.skillUpdateSnoozedVersion,
  })

  const current = changelog.skillChangelog.currentVersion

  function dismiss() {
    // Snooze the current release so this exact prompt does not return until a
    // newer one ships. Optimistic, so the dialog closes immediately.
    snooze.mutate(current)
  }

  function handleDownload() {
    // The browser follows the link; the server records the download. Assume
    // success and clear the prompt now, reconciling with the server shortly
    // after (see useMarkSkillDownloaded).
    markDownloaded(current)
  }

  return (
    <Dialog open={decision.show} onOpenChange={(next) => { if (!next) dismiss() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-muted-foreground" />
            The agent skill has been updated
          </DialogTitle>
          <DialogDescription>
            Your agent's MCP tools are already up to date — this only updates
            the packaged guidance it reads. Re-download to give it the latest.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] space-y-4 overflow-y-auto">
          {decision.pending.map((release) => (
            <div key={release.version} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">Version {release.version}</span>
                <span className="text-xs text-muted-foreground">{release.date}</span>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {release.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss}>
            Remind me later
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            render={<a href={SKILL_DOWNLOAD_URL} download />}
          >
            <DownloadIcon className="size-4" />
            Download skill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
