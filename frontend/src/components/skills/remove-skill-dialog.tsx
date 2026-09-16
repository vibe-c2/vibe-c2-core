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
import { useRemoveSkill } from "@/graphql/hooks/skills"
import { useSkillStore } from "@/stores/skills"

export function RemoveSkillDialog() {
  const { removeDialogOpen, selectedSkill, closeDialogs } = useSkillStore()
  const remove = useRemoveSkill()
  const [error, setError] = useState<string | null>(null)

  async function handleRemove() {
    if (!selectedSkill) return
    setError(null)
    try {
      await remove.mutateAsync(selectedSkill.name)
      toast.success(`Removed ${selectedSkill.name}`)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the skill")
    }
  }

  return (
    <Dialog
      open={removeDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Skill</DialogTitle>
          <DialogDescription>
            Delete{" "}
            <span className="font-medium text-foreground">
              {selectedSkill?.name}
            </span>{" "}
            and every version of it. The bundles are deleted, the history goes,
            and the name becomes available for anyone to claim. This cannot be
            undone. Copies people already downloaded are unaffected.
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
            onClick={handleRemove}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
