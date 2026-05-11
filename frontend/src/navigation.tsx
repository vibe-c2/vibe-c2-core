import {
  BookOpenIcon,
  LayoutDashboardIcon,
  SearchCheckIcon,
  SwordsIcon,
  UsersIcon,
} from 'lucide-react';
import { type Permission, Permissions } from '@/constants/permissions';

export interface NavigationItem {
  title: string;
  url: string;
  permission?: Permission | null;
  icon?: React.ComponentType<{ className?: string }>;
}

export const navigationItems: NavigationItem[] = [
  {
    title: 'Dashboard',
    url: '/',
    permission: null,
    icon: LayoutDashboardIcon,
  },
  {
    title: 'Wiki',
    url: '/wiki',
    permission: null,
    icon: BookOpenIcon,
  },
  {
    title: 'Findings',
    url: '/findings',
    permission: null,
    icon: SearchCheckIcon,
  },
];

export const navigationAdminItems: NavigationItem[] = [
  {
    title: 'Operations',
    url: '/operations',
    permission: Permissions.OPERATION_READ,
    icon: SwordsIcon,
  },
  {
    title: 'Users',
    url: '/users',
    permission: Permissions.USER_READ,
    icon: UsersIcon,
  },
];
