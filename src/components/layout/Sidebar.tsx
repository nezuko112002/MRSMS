'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, CheckSquare, Warehouse,
  ClipboardCheck, DollarSign, Users,
  LogOut, ChevronLeft, ChevronRight, ChevronUp, HardHat, User
} from 'lucide-react';
import { cn, ROLE_CONFIG } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { UserRole } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Dashboard',      icon: LayoutDashboard, roles: ['requestor','manager','warehouse','finance','admin'] },
  { href: '/requests',      label: 'My Requests',    icon: FileText,        roles: ['requestor','admin'] },
  { href: '/approvals',     label: 'Approvals',      icon: CheckSquare,     roles: ['manager','admin'] },
  { href: '/warehouse',     label: 'Warehouse',      icon: Warehouse,       roles: ['warehouse','admin'] },
  { href: '/confirmations', label: 'Confirmations',  icon: ClipboardCheck,  roles: ['requestor','admin'] },
  { href: '/costs',         label: 'Cost Records',   icon: DollarSign,      roles: ['finance','admin','manager'] },
  { href: '/admin',         label: 'Admin',          icon: Users,           roles: ['admin'] },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    item => profile && item.roles.includes(profile.role)
  );

  const collapseButton = (
    <button
      onClick={onToggle}
      className={cn(
        'flex items-center justify-center rounded-lg p-1.5 flex-shrink-0',
        'text-gray-500 dark:text-gray-400',
        'bg-white/30 dark:bg-white/5 border border-white/50 dark:border-white/10',
        'shadow-sm hover:bg-white/45 dark:hover:bg-white/10 transition-colors'
      )}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
    </button>
  );

  return (
    <aside
      className={cn(
        'glass-sidebar hidden md:flex flex-col h-screen sticky top-0 transition-all duration-300 z-30',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
        {/* Logo */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-4 border-b border-white/10',
          collapsed && 'flex-col px-2 gap-2'
        )}>
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <HardHat className="w-5 h-5 text-white" />
          </div>
          {!collapsed ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">MRSMS</p>
              <div className="flex items-center justify-between gap-2 mt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Stock Management</p>
                {collapseButton}
              </div>
            </div>
          ) : (
            collapseButton
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {!collapsed && (
            <p className="section-label px-3 mb-3">Navigation</p>
          )}
          {visibleItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-brand-600/20 text-brand-600 dark:text-brand-400 border border-brand-500/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={cn('w-4.5 h-4.5 flex-shrink-0', active && 'text-brand-500')} size={18} />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.badge && (
                  <span className="ml-auto text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Profile card with sign-out popover */}
        {profile && (
          <div className="border-t border-white/10 p-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-3 rounded-2xl px-3 py-3',
                    'bg-white/30 dark:bg-white/5 border border-white/50 dark:border-white/10 shadow-sm',
                    'hover:bg-white/45 dark:hover:bg-white/10 transition-colors text-left',
                    collapsed && 'justify-center px-2'
                  )}
                >
                  <div className="w-9 h-9 rounded-full bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={18} className="text-gray-500 dark:text-gray-400" />
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">
                          {profile.full_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {ROLE_CONFIG[profile.role].label}
                        </p>
                      </div>
                      <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
                    </>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align={collapsed ? 'center' : 'start'}
                sideOffset={8}
                className={cn('p-2', !collapsed && 'w-[var(--radix-popover-trigger-width)]')}
              >
                <button
                  type="button"
                  onClick={signOut}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl px-3 py-2.5',
                    'text-red-500 hover:bg-red-500/10 transition-colors text-sm font-medium'
                  )}
                >
                  <LogOut size={18} className="flex-shrink-0" />
                  Sign out
                </button>
              </PopoverContent>
            </Popover>
          </div>
        )}
    </aside>
  );
}
