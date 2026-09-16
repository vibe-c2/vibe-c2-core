import {
  BlocksIcon,
  BookOpenIcon,
  FileCode2Icon,
  KanbanSquareIcon,
  PackageIcon,
  RouteIcon,
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
    title: "Modules",
    url: "/modules",
    permission: Permissions.MODULE_READ,
    icon: BlocksIcon,
  },
  // Not an admin entry despite the group it sits in: publishing and
  // downloading a skill is open to anyone who can sign in. It lives down here
  // because it is a settings-shaped page an operator visits occasionally, not
  // somewhere they work.
  {
    title: "Skills",
    url: "/skills",
    permission: null,
    icon: PackageIcon,
  },
  {
    title: "API Docs",
    url: "/swagger/index.html",
    externalUrl: "/swagger/index.html",
    permission: Permissions.USER_READ,
    icon: FileCode2Icon,
  },
];
