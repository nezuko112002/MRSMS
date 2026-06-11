'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, CheckSquare, Warehouse
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types';

const BOTTOM_NAV = [
  { href: '/dashboard',  label: 'Home',      icon: LayoutDashboard, roles: ['requestor','manager','warehouse','finance','admin'] as UserRole[] },
  { href: '/requests',   label: 'Requests',  icon: FileText,        roles: ['requestor','admin'] as UserRole[] },
  { href: '/approvals',  label: 'Approvals', icon: CheckSquare,     roles: ['manager','admin'] as UserRole[] },
  { href: '/warehouse',  label: 'Warehouse', icon: Warehouse,       roles: ['warehouse','admin'] as UserRole[] },
];

export function BottomNav() {
  const pathname = usePathname();
  const { profile } = useAuth();

  const items = BOTTOM_NAV.filter(item => profile && item.roles.includes(profile.role));

  return (
    <nav className="glass-nav md:hidden fixed bottom-0 inset-x-0 z-40 px-2 pb-safe">
      <div className="flex items-center justify-around py-2">
        {items.slice(0, 5).map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[56px] transition-all duration-150',
                active
                  ? 'text-brand-500 dark:text-brand-400 bg-brand-500/10'
                  : 'text-gray-500 dark:text-gray-400'
              )}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
