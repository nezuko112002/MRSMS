'use client';

import { UNITS } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface UnitSelectProps {
  value: string;
  onChange: (value: string) => void;
  triggerClassName?: string;
}

export function UnitSelect({ value, onChange, triggerClassName }: UnitSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="Unit" />
      </SelectTrigger>
      <SelectContent>
        {UNITS.map((unit) => (
          <SelectItem key={unit} value={unit}>
            {unit}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
