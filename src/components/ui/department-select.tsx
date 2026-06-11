'use client';

import { DEPARTMENTS } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const EMPTY_VALUE = '__none__';

interface DepartmentSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  triggerClassName?: string;
}

export function DepartmentSelect({
  value,
  onChange,
  placeholder = 'Select department...',
  emptyLabel = 'Select...',
  allowEmpty = true,
  triggerClassName,
}: DepartmentSelectProps) {
  return (
    <Select
      value={value || (allowEmpty ? EMPTY_VALUE : undefined)}
      onValueChange={(v) => onChange(v === EMPTY_VALUE ? '' : v)}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value={EMPTY_VALUE}>{emptyLabel}</SelectItem>
        )}
        {DEPARTMENTS.map((dept) => (
          <SelectItem key={dept} value={dept}>
            {dept}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
