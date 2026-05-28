import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTaskStore } from "@/stores/tasks"
import { useChangeTaskStage } from "@/graphql/hooks/tasks"

// ReopenTaskDialog confirms re-opening a task that was previously closed
// with a terminal outcome (SUCCESS / FAIL). Dropping a "done & succeeded"
// card back into In Process implicitly invalidates that outcome, so we
// ask the operator to confirm and then clear the status to UNDEFINED in
// the same mutation.
export function ReopenTaskDialog() {
  const pendingReopen = useTaskStore((s) => s.pendingReopen)
  const closeReopenModal = useTaskStore((s) => s.closeReopenModal)
  const changeStage = useChangeTaskStage()
  const [error, setError] = useState<string | null>(null)

  const open = pendingReopen !== null

  async function handleConfirm() {
    if (!pendingReopen) return
    setError(null)
    try {
      await changeStage.mutateAsync({
        taskId: pendingReopen.taskId,
        stage: pendingReopen.newStage,
        // Reopening clears the previous outcome — leaving SUCCESS / FAIL
        // on an in-progress task would render a misleading badge.
        status: "UNDEFINED",
      })
      closeReopenModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen task")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null)
          closeReopenModal()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen this task?</DialogTitle>
          <DialogDescription>
            {pendingReopen
              ? `“${pendingReopen.taskName}” already has an outcome. Moving it out of Done will clear the Success / Fail status. Continue?`
              : "Moving this task out of Done will clear its outcome."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => closeReopenModal()}
            disabled={changeStage.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={changeStage.isPending}
          >
            {changeStage.isPending ? "Reopening…" : "Reopen task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
