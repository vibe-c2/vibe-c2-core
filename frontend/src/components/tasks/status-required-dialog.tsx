import { useState } from "react"
import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useTaskStore } from "@/stores/tasks"
import { useChangeTaskStage } from "@/graphql/hooks/tasks"
import {
  MAX_TASK_SUMMARY_WORDS,
  countWords,
} from "@/components/tasks/use-task-stage-transition"
import type { TaskStatus } from "@/graphql/gql/graphql"

// StatusRequiredDialog appears when a kanban drop lands a task in DONE
// without a terminal status. The board posts the pending change to the
// store; this dialog reads it, asks the operator for SUCCESS or FAIL,
// then commits via changeTaskStage. Cancelling leaves the task in its
// original stage (the optimistic move is rolled back by the lists
// invalidating after the cancel close).
export function StatusRequiredDialog() {
  const pendingStageChange = useTaskStore((s) => s.pendingStageChange)
  const closeStatusRequiredModal = useTaskStore(
    (s) => s.closeStatusRequiredModal,
  )
  const changeStage = useChangeTaskStage()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TaskStatus | null>(null)
  const [summary, setSummary] = useState("")

  const open = pendingStageChange !== null

  // Live word count drives the counter and gates the confirm button so the
  // operator can't submit a summary the server would reject. Required (>= 1
  // word) and capped at MAX_TASK_SUMMARY_WORDS.
  const wordCount = countWords(summary)
  const summaryTooLong = wordCount > MAX_TASK_SUMMARY_WORDS
  const summaryValid = wordCount >= 1 && !summaryTooLong
  const canConfirm = selected !== null && summaryValid

  function resetFields() {
    setSelected(null)
    setSummary("")
    setError(null)
  }

  async function handleConfirm() {
    if (!pendingStageChange || !canConfirm) return
    setError(null)
    try {
      await changeStage.mutateAsync({
        taskId: pendingStageChange.taskId,
        stage: pendingStageChange.newStage,
        status: selected,
        summary: summary.trim(),
      })
      resetFields()
      closeStatusRequiredModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          resetFields()
          closeStatusRequiredModal()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How did it go?</DialogTitle>
          <DialogDescription>
            {pendingStageChange
              ? `Mark “${pendingStageChange.taskName}” as Success or Fail and add a one-line summary before moving it to Done.`
              : "Pick an outcome and summarize it to finish the move."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Two-button picker is enough for a binary terminal status — a
            radio group adds keyboard nav nuance without UX gain at n=2. */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSelected("SUCCESS")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
              selected === "SUCCESS"
                ? "border-emerald-500/60 bg-emerald-500/10"
                : "hover:bg-accent/50",
            )}
          >
            <CheckCircle2Icon className="size-8 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">Success</span>
            <span className="text-xs text-muted-foreground">Goal achieved</span>
          </button>
          <button
            type="button"
            onClick={() => setSelected("FAIL")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
              selected === "FAIL"
                ? "border-rose-500/60 bg-rose-500/10"
                : "hover:bg-accent/50",
            )}
          >
            <XCircleIcon className="size-8 text-rose-600 dark:text-rose-400" />
            <span className="font-medium">Fail</span>
            <span className="text-xs text-muted-foreground">Did not work</span>
          </button>
        </div>

        {/* Required completion summary. Forcing a short line (≤ 15 words)
            keeps the board's history scannable — a sentence, not an essay. */}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="task-done-summary">Summary</Label>
            <span
              className={cn(
                "text-xs tabular-nums",
                summaryTooLong ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {wordCount}/{MAX_TASK_SUMMARY_WORDS} words
            </span>
          </div>
          <Textarea
            id="task-done-summary"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One sentence on how it went — what was achieved or why it failed."
            aria-invalid={summaryTooLong}
            className={cn(
              "resize-none",
              summaryTooLong &&
                "border-destructive focus-visible:ring-destructive/30",
            )}
          />
          {summaryTooLong && (
            <p className="text-xs text-destructive">
              Keep it to {MAX_TASK_SUMMARY_WORDS} words or fewer.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => closeStatusRequiredModal()}
            disabled={changeStage.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || changeStage.isPending}
          >
            {changeStage.isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
