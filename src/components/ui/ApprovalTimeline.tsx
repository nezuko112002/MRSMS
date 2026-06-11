import { formatDateTime, cn } from '@/lib/utils';
import { parseHistoryComments, getTimelineItemRefs } from '@/lib/historyComments';
import type { ApprovalHistory, MaterialRequestItem } from '@/types';
import { CheckCircle, XCircle, Clock, Truck, Package, AlertCircle } from 'lucide-react';

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  submitted:          { icon: Clock,        color: 'text-amber-400 bg-amber-400/15',     label: 'Submitted' },
  pending:            { icon: Clock,        color: 'text-amber-400 bg-amber-400/15',     label: 'Pending Review' },
  approved:           { icon: CheckCircle,  color: 'text-emerald-400 bg-emerald-400/15', label: 'Approved' },
  partially_approved: { icon: AlertCircle,  color: 'text-cyan-400 bg-cyan-400/15',       label: 'Partially Approved' },
  partially_released: { icon: Truck,        color: 'text-violet-400 bg-violet-400/15',   label: 'Partially Released' },
  rejected:           { icon: XCircle,      color: 'text-red-400 bg-red-400/15',         label: 'Rejected' },
  released:           { icon: Truck,        color: 'text-violet-400 bg-violet-400/15',   label: 'Released' },
  confirmed:          { icon: Package,      color: 'text-teal-400 bg-teal-400/15',       label: 'Confirmed' },
  completed:          { icon: CheckCircle,  color: 'text-green-400 bg-green-400/15',     label: 'Completed' },
};

interface TimelineProps {
  history: ApprovalHistory[];
  items?: Pick<MaterialRequestItem, 'sort_order' | 'description' | 'status'>[];
}

export function ApprovalTimeline({ history, items = [] }: TimelineProps) {
  return (
    <div className="space-y-4">
      {history.map((entry, i) => {
        const cfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG['submitted'];
        const Icon = cfg.icon;
        const isLast = i === history.length - 1;
        const { message } = parseHistoryComments(entry.comments);
        const itemRefs = getTimelineItemRefs(entry, items, history, i);

        return (
          <div key={entry.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', cfg.color.split(' ')[1])}>
                <Icon size={16} className={cfg.color.split(' ')[0]} />
              </div>
              {!isLast && <div className="w-px flex-1 mt-1 bg-white/10 dark:bg-white/5" />}
            </div>
            <div className="pb-4 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{cfg.label}</p>
              {entry.profile && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  by {entry.profile.full_name}
                </p>
              )}
              {itemRefs.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {itemRefs.map(ref => (
                    <span
                      key={`${entry.id}-${ref}`}
                      className="badge text-[10px] px-2 py-0.5 bg-brand-500/15 text-brand-400 border border-brand-500/20"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              )}
              {message && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">&quot;{message}&quot;</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {formatDateTime(entry.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
