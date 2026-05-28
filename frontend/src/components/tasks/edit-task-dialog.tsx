import { useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon, Trash2Icon } from "lucide-react"
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
import {
  useTask,
  useUpdateTask,
  useSetTaskAssignees,
  useSetTaskWikiReferences,
  useSetTaskCredentialReferences,
} from "@/graphql/hooks/tasks"
import {
  TaskFormFields,
  emptyTaskFormValues,
  type TaskFormValues,
} from "@/components/tasks/task-form-fields"
import { TaskRelationsFields } from "@/components/tasks/task-relations-fields"
import {
  emptyTaskRelationsValues,
  idsEqual,
  type TaskRelationsValues,
} from "@/components/tasks/task-relations"
import { buildTaskShareUrl } from "@/components/tasks/task-share-link"
import { relativeTime } from "@/lib/relative-time"

// Autosave dialog. Each field commits on its own trigger:
//   - Text inputs: on blur (focus loss)
//   - Score swatches: immediately on click
//   - Relations: immediately when a chip is added or removed
//
// Per-commit diffing against `lastSavedRef` skips no-op round trips (blur
// without typing, score click on the already-selected value, etc.). Hydration
// from the server cache is gated on a "first-seed" ref so cache updates from
// our own autosave don't clobber whatever the operator is currently typing.
export function EditTaskDialog() {
  const editDialogOpen = useTaskStore((s) => s.editDialogOpen)
  const closeEditDialog = useTaskStore((s) => s.closeEditDialog)
  const openDeleteDialog = useTaskStore((s) => s.openDeleteDialog)
  const selectedId = useTaskStore((s) => s.selected?.id ?? null)

  const taskQuery = useTask(selectedId ?? "", { enabled: editDialogOpen })
  const updateTask = useUpdateTask()
  const setAssignees = useSetTaskAssignees()
  const setWikiRefs = useSetTaskWikiReferences()
  const setCredRefs = useSetTaskCredentialReferences()

  const [values, setValues] = useState<TaskFormValues>(emptyTaskFormValues)
  const [relations, setRelations] = useState<TaskRelationsValues>(
    emptyTaskRelationsValues,
  )
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Last successfully-saved snapshots. `commitScalars` and `commitRelations`
  // diff incoming values against these to suppress no-op mutations. Refs (not
  // state) so a successful save doesn't trigger a re-render before the next
  // edit lands.
  const lastSavedValuesRef = useRef<TaskFormValues>(emptyTaskFormValues)
  const lastSavedRelationIdsRef = useRef<{
    assignees: string[]
    wikiReferences: string[]
    credentialReferences: string[]
  }>({ assignees: [], wikiReferences: [], credentialReferences: [] })

  // Tracks which task id has been seeded into local state. Without this, the
  // hydration effect would re-run on every cache update — including the one
  // we trigger from our own autosave — and clobber the operator's in-flight
  // typing with the just-saved values it shouldn't need to overwrite.
  const seededIdRef = useRef<string | null>(null)

  useEffect(() => {
    const t = taskQuery.data?.task
    if (!editDialogOpen || !t) return
    if (seededIdRef.current === t.id) return
    seededIdRef.current = t.id

    const nextValues: TaskFormValues = {
      name: t.name,
      description: t.description,
      riskScore: t.riskScore,
      riskDescription: t.riskDescription,
      profitScore: t.profitScore,
      profitDescription: t.profitDescription,
    }
    const nextRelations: TaskRelationsValues = {
      assignees: t.assignees.map((u) => ({ id: u.id, label: u.username })),
      wikiReferences: t.wikiReferences.map((d) => ({
        id: d.id,
        label: d.title || "Untitled",
      })),
      credentialReferences: t.credentialReferences.map((c) => ({
        id: c.id,
        label: c.name,
        hint: c.type.toLowerCase(),
      })),
    }

    setValues(nextValues)
    setRelations(nextRelations)
    lastSavedValuesRef.current = nextValues
    lastSavedRelationIdsRef.current = {
      assignees: t.assignees.map((u) => u.id),
      wikiReferences: t.wikiReferences.map((d) => d.id),
      credentialReferences: t.credentialReferences.map((c) => c.id),
    }
    setError(null)
  }, [editDialogOpen, taskQuery.data?.task])

  // Reset seeding + error when the dialog closes so the next open re-hydrates
  // from a clean slate.
  useEffect(() => {
    if (editDialogOpen) return
    seededIdRef.current = null
    setError(null)
    setCopied(false)
  }, [editDialogOpen])

  function scalarsChanged(next: TaskFormValues): boolean {
    const prev = lastSavedValuesRef.current
    return (
      next.name !== prev.name ||
      next.description !== prev.description ||
      next.riskScore !== prev.riskScore ||
      next.riskDescription !== prev.riskDescription ||
      next.profitScore !== prev.profitScore ||
      next.profitDescription !== prev.profitDescription
    )
  }

  async function commitScalars(next: TaskFormValues) {
    if (!selectedId) return
    // Server requires a non-empty name. Skip the round-trip while the field
    // is empty; the operator will refill it or close the dialog. Restoring a
    // valid name then re-blurring will pick the save back up.
    if (!next.name.trim()) return
    if (!scalarsChanged(next)) return
    try {
      await updateTask.mutateAsync({
        id: selectedId,
        input: {
          name: next.name.trim(),
          description: next.description,
          riskScore: next.riskScore,
          riskDescription: next.riskDescription,
          profitScore: next.profitScore,
          profitDescription: next.profitDescription,
        },
      })
      lastSavedValuesRef.current = { ...next, name: next.name.trim() }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task")
    }
  }

  async function commitRelations(next: TaskRelationsValues) {
    if (!selectedId) return
    const assigneeIds = next.assignees.map((a) => a.id)
    const wikiIds = next.wikiReferences.map((w) => w.id)
    const credIds = next.credentialReferences.map((c) => c.id)
    const prev = lastSavedRelationIdsRef.current

    try {
      // Fire in parallel — the three relation mutations are independent on
      // the server side. The cache entry's last-writer-wins behaviour is fine
      // because each mutation returns the full task and we don't read across
      // them within this commit.
      const pending: Promise<unknown>[] = []
      if (!idsEqual(assigneeIds, prev.assignees)) {
        pending.push(
          setAssignees.mutateAsync({ taskId: selectedId, assigneeIds }),
        )
      }
      if (!idsEqual(wikiIds, prev.wikiReferences)) {
        pending.push(
          setWikiRefs.mutateAsync({ taskId: selectedId, wikiIds }),
        )
      }
      if (!idsEqual(credIds, prev.credentialReferences)) {
        pending.push(
          setCredRefs.mutateAsync({
            taskId: selectedId,
            credentialIds: credIds,
          }),
        )
      }
      if (pending.length === 0) return
      await Promise.all(pending)
      lastSavedRelationIdsRef.current = {
        assignees: assigneeIds,
        wikiReferences: wikiIds,
        credentialReferences: credIds,
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task")
    }
  }

  function handleRelationsChange(next: TaskRelationsValues) {
    setRelations(next)
    commitRelations(next)
  }

  function copyShareLink() {
    if (!selectedId) return
    navigator.clipboard.writeText(buildTaskShareUrl(selectedId))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const task = taskQuery.data?.task
  const operationId = task?.operationId ?? ""
  const isSaving =
    updateTask.isPending ||
    setAssignees.isPending ||
    setWikiRefs.isPending ||
    setCredRefs.isPending

  return (
    <Dialog
      open={editDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeEditDialog()
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Edit task</span>
            {isSaving && (
              <span className="text-xs font-normal text-muted-foreground">
                Saving…
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Changes save automatically. Stage and status are managed from the
            kanban board.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="mb-3 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="grid gap-6">
          <TaskFormFields
            idPrefix="edit-task"
            values={values}
            onChange={setValues}
            onCommit={commitScalars}
          />
          {operationId && (
            <TaskRelationsFields
              operationId={operationId}
              values={relations}
              onChange={handleRelationsChange}
            />
          )}

          {task && (
            <div className="grid grid-cols-2 gap-4 border-t pt-3 text-xs text-muted-foreground">
              <div>
                Created{" "}
                {task.createdBy ? (
                  <>
                    by{" "}
                    <span className="text-foreground">
                      {task.createdBy.username}
                    </span>{" "}
                  </>
                ) : (
                  ""
                )}
                {relativeTime(task.createdAt)}
              </div>
              {task.lastUpdatedAt && (
                <div className="text-right">
                  Updated{" "}
                  {task.lastUpdatedBy ? (
                    <>
                      by{" "}
                      <span className="text-foreground">
                        {task.lastUpdatedBy.username}
                      </span>{" "}
                    </>
                  ) : (
                    ""
                  )}
                  {relativeTime(task.lastUpdatedAt)}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="mt-4 flex-row items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copyShareLink}
            disabled={!task}
          >
            {copied ? (
              <>
                <CheckIcon className="size-4" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="size-4" />
                Copy link
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (!task) return
              openDeleteDialog({ id: task.id, name: task.name })
            }}
            disabled={!task}
          >
            <Trash2Icon className="size-4" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
