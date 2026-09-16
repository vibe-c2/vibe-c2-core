import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { communitySkillKeys } from "@/graphql/hooks/skills"
import { SKILL_ACCEPT, formatBytes, publishSkill } from "@/lib/skill-upload"

interface PublishSkillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-filled and locked when publishing a new version of an existing skill. */
  existingName?: string | null
  maxUploadBytes: number
}

/**
 * Publishes a zip to the registry.
 *
 * The name field is the consequential one: taking a free name claims it for
 * this operator permanently, and from then on only they can publish under it.
 * The dialog says so rather than discovering it through a refusal later.
 */
export function PublishSkillDialog({
  open,
  onOpenChange,
  existingName,
  maxUploadBytes,
}: PublishSkillDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed so each opening starts from empty fields. Remounting is the
            reset: an effect that clears state on open would run a second
            render every time the dialog appears. */}
        {open && (
          <PublishSkillForm
            key={existingName ?? "new"}
            onOpenChange={onOpenChange}
            existingName={existingName}
            maxUploadBytes={maxUploadBytes}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PublishSkillForm({
  onOpenChange,
  existingName,
  maxUploadBytes,
}: Omit<PublishSkillDialogProps, "open">) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(existingName ?? "")
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const isNewVersion = Boolean(existingName)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file || !name.trim()) return

    setBusy(true)
    try {
      const published = await publishSkill({
        name: name.trim(),
        description: description.trim(),
        notes: notes.trim(),
        file,
        maxBytes: maxUploadBytes,
      })
      queryClient.invalidateQueries({ queryKey: communitySkillKeys.all })
      toast.success(
        published.claimed
          ? `Published ${published.name}. The name is yours now.`
          : `Published ${published.name} v${published.version}.`,
      )
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Publishing failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {isNewVersion ? `New version of ${existingName}` : "Publish a skill"}
        </DialogTitle>
        <DialogDescription>
          {isNewVersion
            ? "Everyone who downloaded this skill will be told there is a new version. Earlier versions stay downloadable."
            : "Anyone on this server can download it, under your name. A free name becomes yours, and only you can publish new versions of it."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="skill-name">Name</Label>
          <Input
            id="skill-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isNewVersion || busy}
            placeholder="recon-sweep"
            required
          />
          {!isNewVersion && (
            <p className="text-xs text-muted-foreground">
              Lowercased and hyphenated, so "Recon Sweep" and "recon-sweep"
              are the same skill.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="skill-description">Description</Label>
          <Input
            id="skill-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
            placeholder="One line, shown in the list"
          />
        </div>

        {isNewVersion && (
          <div className="space-y-1.5">
            <Label htmlFor="skill-notes">What changed</Label>
            <Textarea
              id="skill-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Read by everyone deciding whether to update"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="skill-file">Bundle</Label>
          <Input
            id="skill-file"
            type="file"
            accept={SKILL_ACCEPT}
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
            className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          />
          <p className="text-xs text-muted-foreground">
            A zip of the skill directory, up to {formatBytes(maxUploadBytes)}.
            It is stored and handed out exactly as uploaded.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !file || !name.trim()}>
          <UploadIcon className="size-4" />
          {busy ? "Publishing…" : "Publish"}
        </Button>
      </DialogFooter>
    </form>
  )
}
