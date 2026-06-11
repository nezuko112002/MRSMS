'use client';

import { ROLE_CONFIG } from '@/lib/utils';
import type { UserRole } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RoleSelectProps {
  value: UserRole;
  onChange: (value: UserRole) => void;
  placeholder?: string;
  triggerClassName?: string;
}

export function RoleSelect({
  value,
  onChange,
  placeholder = 'Select role...',
  triggerClassName,
}: RoleSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as UserRole)}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ROLE_CONFIG).map(([val, cfg]) => (
          <SelectItem key={val} value={val}>
            {cfg.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
