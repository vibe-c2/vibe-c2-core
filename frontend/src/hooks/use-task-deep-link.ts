import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router"
import { useTaskStore } from "@/stores/tasks"

// URL search-param key for the task deep-link flow. `?task=<id>` opens the
// task edit dialog with that id; closing strips the param. See
// `buildTaskShareUrl` in `components/tasks/task-share-link.ts` for the
// producer side.
const TASK_PARAM = "task"

// Keeps `?task=<id>` in the URL in lockstep with the task edit dialog in
// `useTaskStore`. The edit dialog doubles as the preview surface — clicking
// a card opens the same modal used for editing — so the deep link binds to
// it directly. Cloned line-for-line from `use-credential-deep-link.ts` —
// the two-effect / two-ref structure is load-bearing:
//
//   URL → store: arriving with `?task=<id>` opens the dialog with that id.
//   A reload while the dialog is open re-opens it.
//
//   store → URL: opening the dialog (row click, deep link, etc.) mirrors the
//   selected id into the URL so the page is always copy-link-able. Closing
//   the dialog strips the param.
//
// Both effects are edge-triggered (refs track previous values) so they only
// react to the change they care about. Without this guard, the closed→opened
// path would race with the URL-strip-on-close path and re-open the dialog
// after every close.
//
// Mounted exactly once by `TasksPage`. There is no separate tab system for
// tasks (unlike Findings → Credentials/Sessions), so this hook does not need
// to flip an active tab — the page is always on the tasks surface when
// mounted.
export function useTaskDeepLink() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTaskId = searchParams.get(TASK_PARAM)

  const editDialogOpen = useTaskStore((s) => s.editDialogOpen)
  const selectedId = useTaskStore((s) => s.selected?.id ?? null)
  const openEditDialog = useTaskStore((s) => s.openEditDialog)

  // URL → store: fires only on URL transitions to a non-null id. Bails if the
  // store already shows that task, which prevents clobbering a row-click's
  // `name` with an empty placeholder when Effect 2 mirrors the id into the
  // URL.
  const prevUrlIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevUrlIdRef.current
    prevUrlIdRef.current = urlTaskId
    if (prev === urlTaskId) return
    if (!urlTaskId) return
    if (editDialogOpen && selectedId === urlTaskId) return
    openEditDialog({ id: urlTaskId, name: "" })
  }, [urlTaskId, editDialogOpen, selectedId, openEditDialog])

  // store → URL: mirror the selection while the dialog is open; strip the
  // param only on the open→closed edge (not on every closed render, which
  // would race with Effect 1 on initial mount with `?task=<id>`).
  const wasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = editDialogOpen

    if (editDialogOpen && selectedId && selectedId !== urlTaskId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(TASK_PARAM, selectedId)
          return next
        },
        { replace: true },
      )
      return
    }
    if (wasOpen && !editDialogOpen && urlTaskId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete(TASK_PARAM)
          return next
        },
        { replace: true },
      )
    }
  }, [editDialogOpen, selectedId, urlTaskId, setSearchParams])
}
