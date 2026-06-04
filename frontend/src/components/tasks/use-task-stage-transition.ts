import { useCallback } from "react"
import { toast } from "sonner"
import { useChangeTaskStage } from "@/graphql/hooks/tasks"
import { useTaskStore } from "@/stores/tasks"
import type { TaskStage, TaskStatus } from "@/graphql/gql/graphql"

// Minimal shape a stage transition needs to decide its path. Both the kanban
// board (drag-drop) and the edit dialog (stage control) supply this from
// whatever task object they already hold.
export interface StageTransitionTask {
  id: string
  name: string
  stage: TaskStage
  status: TaskStatus
}

// useTaskStageTransition centralises the DONE-requires-status and
// reopen-clears-status invariants so every surface that changes a stage —
// the kanban board today, the edit dialog now — applies the exact same
// rules. Without this the logic was inlined in handleDragEnd and would have
// drifted the moment a second caller appeared.
//
// The returned function either commits the move directly or hands off to the
// store-driven StatusRequired / Reopen modals (both mounted globally in
// AppLayout), which finish the mutation once the operator answers.
export function useTaskStageTransition() {
  const changeStage = useChangeTaskStage()
  const openStatusRequiredModal = useTaskStore(
    (s) => s.openStatusRequiredModal,
  )
  const openReopenModal = useTaskStore((s) => s.openReopenModal)

  const requestStageChange = useCallback(
    async (task: StageTransitionTask, targetStage: TaskStage) => {
      if (task.stage === targetStage) return

      // Moving INTO Done always routes through the status-required modal: the
      // operator picks SUCCESS / FAIL and writes a fresh completion summary
      // (required) before the move commits. We prompt even when the task
      // still carries a terminal status from a prior completion — re-completing
      // is a new outcome and deserves its own summary. The early return above
      // guarantees task.stage !== "DONE" here, so this is genuinely "entering
      // Done".
      if (targetStage === "DONE") {
        openStatusRequiredModal({
          taskId: task.id,
          taskName: task.name,
          newStage: targetStage,
        })
        return
      }

      // Moving OUT of Done while still carrying an outcome (SUCCESS / FAIL)
      // is a re-open: confirm, then the modal commits with status cleared.
      // targetStage is necessarily non-DONE here — the entering-Done branch
      // above already returned.
      if (task.stage === "DONE" && task.status !== "UNDEFINED") {
        openReopenModal({
          taskId: task.id,
          taskName: task.name,
          newStage: targetStage,
        })
        return
      }

      try {
        await changeStage.mutateAsync({
          taskId: task.id,
          stage: targetStage,
          // Preserve the existing status for non-DONE moves. The server
          // no-ops when the value didn't change.
          status: task.status,
        })
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to move task",
        )
      }
    },
    [changeStage, openStatusRequiredModal, openReopenModal],
  )

  // isPending only covers the direct-commit path; the modal hand-offs own
  // their own pending state. That's the intent — callers disable their
  // control during an inline move, while a modal move shows its own spinner.
  return { requestStageChange, isPending: changeStage.isPending }
}

// Left-to-right stage order, shared by the board columns and the edit
// dialog's stage control so both render the workflow in the same sequence.
export const ALL_STAGES: TaskStage[] = ["BACKLOG", "TODO", "IN_PROCESS", "DONE"]

// MAX_TASK_SUMMARY_WORDS mirrors models.MaxTaskSummaryWords on the server.
// The status-required dialog enforces it live so the operator never submits a
// summary the server would bounce; the server remains the source of truth.
export const MAX_TASK_SUMMARY_WORDS = 15

// countWords matches the server's strings.Fields semantics: any run of
// whitespace separates words, and leading/trailing/duplicate spaces don't
// count. Keep this in lockstep with NormalizeAndValidateDoneSummary so the
// live counter and the server validator never disagree.
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length
}
