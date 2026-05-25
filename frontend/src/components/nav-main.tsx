import { Link, useLocation } from "react-router"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { NavigationItem } from "@/navigation"

export function NavMain({ items }: { items: NavigationItem[] }) {
  const { pathname } = useLocation()

  return (
    <SidebarGroup>
      <SidebarMenu className="gap-1">
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={
                !item.externalUrl &&
                (pathname === item.url || pathname.startsWith(item.url + "/"))
              }
              render={
                item.externalUrl ? (
                  <a
                    href={item.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  />
                ) : (
                  <Link to={item.url} />
                )
              }
            >
              {item.icon && <item.icon className="size-4" />}
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
