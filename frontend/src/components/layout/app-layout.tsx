import { Outlet } from "react-router"
import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAppStore } from "@/stores/app"
import { useTaskDeepLink } from "@/hooks/use-task-deep-link"
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog"
import { DeleteTaskDialog } from "@/components/tasks/delete-task-dialog"
import { StatusRequiredDialog } from "@/components/tasks/status-required-dialog"
import { ReopenTaskDialog } from "@/components/tasks/reopen-task-dialog"
import { WikiDocumentPickerDialog } from "@/components/wiki/wiki-document-picker-dialog"
import { TaskPickerDialog } from "@/components/tasks/task-picker-dialog"

export function AppLayout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)

  // The task edit dialog is mounted globally so click-to-open works from any
  // surface that lists tasks (kanban board, matrix, wiki "Task backlinks"
  // footer, credential "Referenced by tasks" panel). Keeping it on the
  // tasks page would force a navigation away from the source context every
  // time an operator drilled into a referenced task.
  //
  // Deep-link sync lives at the same level so `?task=<id>` in the URL opens
  // the dialog on any authed page, not just `/tasks`. The create dialog
  // stays on the tasks page — it needs the page's scoped operation context
  // and there's no cross-domain entry point for it.
  useTaskDeepLink()

  return (
    <TooltipProvider>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        // h-svh locks the wrapper to exactly one viewport. Without this
        // the shadcn primitive uses min-h-svh (a *minimum*), and any
        // tall content (e.g. the kanban column virtualizer's sizer)
        // would push the wrapper past the viewport and trigger a global
        // page scroll instead of the column's internal overflow scroll.
        className="h-svh"
      >
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Outlet />
        </SidebarInset>
        <EditTaskDialog />
        <DeleteTaskDialog />
        <StatusRequiredDialog />
        <ReopenTaskDialog />
        {/* Wiki document picker is mounted globally — the /doc slash command
            (wiki editor) and the task edit dialog's "Wiki references" picker
            both call openWikiDocumentPicker imperatively. */}
        <WikiDocumentPickerDialog />
        {/* Task picker is the mirror image — the wiki editor's "Add to task"
            button calls openTaskPicker imperatively to attach the current
            document to a task without leaving the wiki page. */}
        <TaskPickerDialog />
      </SidebarProvider>
    </TooltipProvider>
  )
}
