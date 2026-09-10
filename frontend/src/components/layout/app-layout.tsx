import { Outlet } from "react-router"
import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAppStore } from "@/stores/app"
import { useTaskDeepLink } from "@/hooks/use-task-deep-link"
import { useFocusBeacon } from "@/hooks/use-focus-beacon"
import { useResumeRefetch } from "@/hooks/use-resume-refetch"
import { AgentActivityRail } from "@/components/layout/agent-activity-rail"
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog"
import { DeleteTaskDialog } from "@/components/tasks/delete-task-dialog"
import { StatusRequiredDialog } from "@/components/tasks/status-required-dialog"
import { ReopenTaskDialog } from "@/components/tasks/reopen-task-dialog"
import { WikiCommandPalette } from "@/components/wiki/wiki-command-palette"
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

  // The attention channel. Publishes what the operator is currently looking
  // at so an AI agent connected over MCP can follow along rather than asking
  // which operation or page to work on. Mounted here because it needs router
  // context (App.tsx nests BrowserRouter inside the providers) and because
  // every authed surface should report, not just one page.
  useFocusBeacon()

  // Subscriptions are dropped while the tab is hidden and nothing replays what
  // they missed, so the caches they feed come back stale. Mounted alongside the
  // beacon because the two describe the same absence from the operator's side:
  // one says they stopped watching, this one catches them up when they return.
  useResumeRefetch()

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
          {/* Floated over the page rather than placed in it: every surface
              should show what the agent is doing, and no page owns the
              concern. Renders nothing when no agent is active. */}
          <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex justify-end">
            <div className="pointer-events-auto">
              <AgentActivityRail />
            </div>
          </div>
        </SidebarInset>
        <EditTaskDialog />
        <DeleteTaskDialog />
        <StatusRequiredDialog />
        <ReopenTaskDialog />
        {/* Unified wiki search/picker palette, mounted globally. Drives both
            the Cmd+K / "search within" navigate surface (openWikiSearch) and
            every document-reference picker (openWikiDocumentPicker): the /doc
            slash command, the move dialog's parent chooser, and the task edit
            dialog's "Wiki references". */}
        <WikiCommandPalette />
        {/* Task picker is the mirror image — the wiki editor's "Add to task"
            button calls openTaskPicker imperatively to attach the current
            document to a task without leaving the wiki page. */}
        <TaskPickerDialog />
      </SidebarProvider>
    </TooltipProvider>
  )
}
