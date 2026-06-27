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
import { useModuleStore } from "@/stores/modules"
import { useRemoveModule } from "@/graphql/hooks/modules"

export function RemoveModuleDialog() {
  const { removeDialogOpen, selectedModule, closeDialogs } = useModuleStore()
  const removeModule = useRemoveModule()
  const [error, setError] = useState<string | null>(null)

  async function handleRemove() {
    if (!selectedModule) return
    setError(null)

    try {
      await removeModule.mutateAsync(selectedModule.instance)
      toast.success(`Removed ${selectedModule.instance}`)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove module")
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
          <DialogTitle>Remove Module</DialogTitle>
          <DialogDescription>
            Deregister{" "}
            <span className="font-medium text-foreground">
              {selectedModule?.instance}
            </span>
            . This drops it from the active registry and blocks its data-plane
            traffic. If the module is still running it will re-register on its
            next reconnect and reappear here.
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
            disabled={removeModule.isPending}
          >
            {removeModule.isPending ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
