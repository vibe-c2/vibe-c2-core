import { useNavigate } from "react-router"
import { PackageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSkillRegistry, useSnoozeSkill } from "@/graphql/hooks/skills"
import { useMe } from "@/graphql/hooks/users"
import { useSkillChangelog } from "@/graphql/hooks/skill"
import { findSkillsToPromptFor } from "@/lib/community-skill-update"
import { decideSkillUpdate } from "@/lib/skill-update"

/**
 * Tells an operator when a skill they downloaded has been republished.
 *
 * One prompt for every stale skill rather than one prompt each: the number of
 * published skills is not bounded, and a queue of modals is how a useful
 * notification becomes something people close without reading. It also does
 * not offer downloads inline — with several skills that is several decisions,
 * and the page is where they are laid out.
 *
 * Which skills qualify is decided by findSkillsToPromptFor, which is unit
 * tested; this component only renders the result.
 */
export function CommunitySkillUpdateDialog() {
  const navigate = useNavigate()
  const { data } = useSkillRegistry()
  const snooze = useSnoozeSkill()

  const stale = findSkillsToPromptFor(data?.skillRegistry.skills ?? [])
  // Two prompts stacked on a fresh page load is worse than one prompt twice.
  // The built-in skill goes first: it is the one an agent cannot work without.
  const builtinPrompting = useBuiltinSkillPrompting()

  if (stale.length === 0 || builtinPrompting) return null

  // Dismissing covers every skill in the prompt: they were all shown, so
  // asking again about any of them would be asking twice.
  function dismiss() {
    for (const skill of stale) {
      snooze.mutate({ name: skill.name, version: skill.currentVersion })
    }
  }

  function openSkills() {
    dismiss()
    navigate("/skills")
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) dismiss() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageIcon className="size-4 text-muted-foreground" />
            {stale.length === 1
              ? "A skill you use has been updated"
              : `${stale.length} skills you use have been updated`}
          </DialogTitle>
          <DialogDescription>
            Published by other operators on this server. Your copy stays as it
            is until you download the new one.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[45vh] space-y-3 overflow-y-auto">
          {stale.map((skill) => (
            <li key={skill.name} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{skill.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  v{skill.installedVersion} → v{skill.currentVersion}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                by {skill.ownerUsername}
                {skill.description ? ` — ${skill.description}` : ""}
              </p>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss}>
            Remind me later
          </Button>
          <Button type="button" onClick={openSkills}>
            Open skills
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Whether the built-in skill's own prompt is currently showing. Read through
// the same decision that dialog uses rather than a shared flag, so the two
// cannot disagree about what is on screen.
function useBuiltinSkillPrompting(): boolean {
  const { data: me } = useMe()
  const { data: changelog } = useSkillChangelog()
  if (!me?.me || !changelog) return false
  return decideSkillUpdate({
    currentVersion: changelog.skillChangelog.currentVersion,
    releases: changelog.skillChangelog.releases,
    downloadedVersion: me.me.skillDownloadedVersion,
    snoozedVersion: me.me.skillUpdateSnoozedVersion,
  }).show
}
