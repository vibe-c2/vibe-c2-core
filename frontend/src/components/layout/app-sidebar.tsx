import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { OperationSwitcher } from "@/components/layout/operation-switcher"
import {
  navigationItems,
  navigationGlobalItems,
  navigationAdminItems,
} from "@/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuthStore } from "@/stores/auth"
import { useScopedOperationStore } from "@/stores/scoped-operation"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const scopedOperation = useScopedOperationStore((s) => s.scopedOperation)

  // Filter admin nav items by the user's permissions
  const visibleAdminItems = navigationAdminItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  )

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <OperationSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex flex-col">
        {scopedOperation && <NavMain items={navigationItems} />}
        {/* Global items (Findings) stay visible whether or not an operation
            is scoped; Findings switches to its cross-operation mode in that
            case so users can search across the operations they belong to. */}
        <NavMain items={navigationGlobalItems} />
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
