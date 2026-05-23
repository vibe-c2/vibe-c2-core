import {
  BookOpenIcon,
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
}

// Navigation entries that require an operation to be scoped. The sidebar
// hides this block until the user picks an operation via the switcher.
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
];
