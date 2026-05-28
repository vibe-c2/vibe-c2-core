import { type FormEvent, useState } from "react"
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
import { useCreateTask } from "@/graphql/hooks/tasks"
import {
  TaskFormFields,
  emptyTaskFormValues,
  type TaskFormValues,
} from "@/components/tasks/task-form-fields"
import { TaskRelationsFields } from "@/components/tasks/task-relations-fields"
import {
  emptyTaskRelationsValues,
  type TaskRelationsValues,
} from "@/components/tasks/task-relations"

interface CreateTaskDialogProps {
  // The Tasks page is always operation-scoped (it renders nothing
  // meaningful without one), so we take the target operation id as a
  // required prop. No global mode like CreateCredentialDialog has.
  operationId: string
}

export function CreateTaskDialog({ operationId }: CreateTaskDialogProps) {
  const { createDialogOpen, closeCreateDialog } = useTaskStore()
  const createTask = useCreateTask()
  const [values, setValues] = useState<TaskFormValues>(emptyTaskFormValues)
  const [relations, setRelations] = useState<TaskRelationsValues>(
    emptyTaskRelationsValues,
  )
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setValues(emptyTaskFormValues)
    setRelations(emptyTaskRelationsValues)
    setError(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!values.name.trim()) {
      setError("Name is required.")
      return
    }
    try {
      await createTask.mutateAsync({
        operationId,
        name: values.name.trim(),
        description: values.description,
        riskScore: values.riskScore,
        riskDescription: values.riskDescription,
        profitScore: values.profitScore,
        profitDescription: values.profitDescription,
        // Relations ship in the same payload — the resolver writes the task
        // row with the reference arrays already populated, so we avoid a
        // second round-trip per relation type.
        assigneeIds: relations.assignees.map((a) => a.id),
        wikiReferenceIds: relations.wikiReferences.map((w) => w.id),
        credentialReferenceIds: relations.credentialReferences.map((c) => c.id),
        // Stage and status are intentionally omitted — new tasks default
        // to BACKLOG/UNDEFINED server-side. Operators move them through
        // the board via drag-drop, which goes through changeTaskStage and
        // enforces the DONE-requires-status invariant uniformly.
      })
      reset()
      closeCreateDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task")
    }
  }

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          closeCreateDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            New tasks land in the Backlog column. Move them across the board
            as work progresses.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off">
          {error && (
            <div className="mb-3 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-6">
            <TaskFormFields
              idPrefix="create-task"
              values={values}
              onChange={setValues}
            />
            <TaskRelationsFields
              operationId={operationId}
              values={relations}
              onChange={setRelations}
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="submit"
              disabled={createTask.isPending || !values.name.trim()}
            >
              {createTask.isPending ? "Saving…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
