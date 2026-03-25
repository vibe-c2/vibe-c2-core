import {
  LayoutDashboardIcon,
  NetworkIcon,
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
];

export const navigationAdminItems: NavigationItem[] = [
  {
    title: 'Operations',
    url: '/operations',
    permission: Permissions.OPERATION_READ,
    icon: NetworkIcon,
  },
  {
    title: 'Users',
    url: '/users',
    permission: Permissions.USER_READ,
    icon: UsersIcon,
  },
];
