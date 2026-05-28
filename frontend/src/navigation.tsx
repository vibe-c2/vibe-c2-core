import {
  BookOpenIcon,
  FileCode2Icon,
  KanbanSquareIcon,
  RouteIcon,
  LayoutDashboardIcon,
  GemIcon,
  SwordsIcon,
  UsersIcon,
} from "lucide-react";
import { type Permission, Permissions } from "@/constants/permissions";

export interface NavigationItem {
  title: string;
  url: string;
  permission?: Permission | null;
  icon?: React.ComponentType<{ className?: string }>;
  // When set, render an external <a target="_blank"> instead of a SPA <Link>.
  // The `url` field is ignored for routing-active-state matching in this case.
  externalUrl?: string;
}

// Operation-scoped entries rendered ABOVE the global block. Hidden until
// the user picks an operation via the switcher.
export const navigationItems: NavigationItem[] = [
  {
    title: "Dashboard",
    url: "/",
    permission: null,
    icon: LayoutDashboardIcon,
  },
];

// Navigation entries that work even when no operation is scoped. Findings
// has a "global / cross-operation" mode for cross-op credential search; Wiki
// falls back to the synthetic Public operation tree when no scope is set.
export const navigationGlobalItems: NavigationItem[] = [
  {
    title: "Wiki",
    url: "/wiki",
    permission: null,
    icon: BookOpenIcon,
  },
  {
    title: "Findings",
    url: "/findings",
    permission: null,
    icon: GemIcon,
  },
];

// Operation-scoped entries rendered BELOW the global block. Hidden until
// the user picks an operation via the switcher.
export const navigationOperationItems: NavigationItem[] = [
  {
    title: "Tasks",
    url: "/tasks",
    permission: null,
    icon: KanbanSquareIcon,
  },
  {
    title: "Timeline",
    url: "/timeline",
    permission: null,
    icon: RouteIcon,
  },
];

export const navigationAdminItems: NavigationItem[] = [
  {
    title: "Operations",
    url: "/operations",
    permission: Permissions.OPERATION_READ,
    icon: SwordsIcon,
  },
  {
    title: "Users",
    url: "/users",
    permission: Permissions.USER_READ,
    icon: UsersIcon,
  },
  {
    title: "API Docs",
    url: "/swagger/index.html",
    externalUrl: "/swagger/index.html",
    permission: Permissions.USER_READ,
    icon: FileCode2Icon,
  },
];
