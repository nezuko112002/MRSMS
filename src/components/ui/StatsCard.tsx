import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  subtext?: string;
  trend?: { value: number; positive?: boolean };
}

export function StatsCard({ label, value, icon: Icon, iconColor = 'text-brand-500', subtext, trend }: StatsCardProps) {
  return (
    <div className="stat-card animate-slide-up">
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-white/30 dark:bg-white/5', iconColor.replace('text-', 'text-'))}>
          <Icon size={20} className={iconColor} />
        </div>
        {trend && (
          <span className={cn(
            'text-xs font-medium badge',
            trend.positive !== false
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/15 text-red-400 border-red-500/20'
          )}>
            {trend.positive !== false ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
        {subtext && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
}
