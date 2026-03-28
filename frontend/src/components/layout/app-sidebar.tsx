import * as React from "react"
import { PanelLeftIcon, TerminalSquareIcon } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { navigationItems, navigationAdminItems } from "@/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuthStore } from "@/stores/auth"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const { open, toggleSidebar } = useSidebar()

  // Filter admin nav items by the user's permissions
  const visibleAdminItems = navigationAdminItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  )

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* When collapsed, the app icon acts as a toggle to open the sidebar */}
            <SidebarMenuButton
              size="lg"
              onClick={!open ? toggleSidebar : undefined}
              className={!open ? "cursor-pointer" : "cursor-default"}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <TerminalSquareIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Vibe C2</span>
                <span className="truncate text-xs text-muted-foreground">
                  Command &amp; Control
                </span>
              </div>
              {/* When open, show sidebar toggle on the right side of the header */}
              {open && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSidebar()
                  }}
                  className="ml-auto flex size-6 items-center justify-center rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <PanelLeftIcon className="size-4" />
                </button>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex flex-col">
        <NavMain items={navigationItems} />
        {visibleAdminItems.length > 0 && (
          <div className="mt-auto">
            <NavMain items={visibleAdminItems} />
          </div>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user?.username ?? "Unknown",
            email: "",
            avatar: "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
