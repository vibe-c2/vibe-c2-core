import { useState } from "react"
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
import { useUnpublishSkill } from "@/graphql/hooks/skills"
import { useSkillStore } from "@/stores/skills"

export function RetireSkillDialog() {
  const { retireDialogOpen, selectedSkill, closeDialogs } = useSkillStore()
  const unpublish = useUnpublishSkill()
  const [error, setError] = useState<string | null>(null)

  async function handleRetire() {
    if (!selectedSkill) return
    setError(null)
    try {
      await unpublish.mutateAsync(selectedSkill.name)
      toast.success(`Retired ${selectedSkill.name}`)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retire the skill")
    }
  }

  return (
    <Dialog
      open={retireDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retire Skill</DialogTitle>
          <DialogDescription>
            Stop handing out{" "}
            <span className="font-medium text-foreground">
              {selectedSkill?.name}
            </span>
            . It disappears from this list and can no longer be downloaded. The
            name stays claimed and every version is kept, so nothing is
            destroyed and an administrator can put it back. Copies people
            already downloaded are unaffected.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeDialogs}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRetire}
            disabled={unpublish.isPending}
          >
            {unpublish.isPending ? "Retiring..." : "Retire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
