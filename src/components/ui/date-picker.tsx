'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Pick a date',
  className,
}: DatePickerProps) {
  const [mounted, setMounted] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  useEffect(() => setMounted(true), []);

  const disabledMatcher =
    minDate && maxDate
      ? { before: minDate, after: maxDate }
      : minDate
        ? { before: minDate }
        : maxDate
          ? { after: maxDate }
          : undefined;

  if (!mounted) {
    return (
      <Button
        variant="outline"
        type="button"
        disabled
        className={cn(
          'w-full justify-start text-left font-normal h-10 rounded-xl',
          'bg-white/40 dark:bg-white/5 border-white/60 dark:border-white/10',
          'text-gray-400 dark:text-gray-500 backdrop-blur-sm',
          className
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
        <span>{placeholder}</span>
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal h-10 rounded-xl',
            'bg-white/40 dark:bg-white/5 border-white/60 dark:border-white/10',
            'text-gray-900 dark:text-gray-100 backdrop-blur-sm',
            'hover:bg-white/50 dark:hover:bg-white/10',
            !value && 'text-gray-400 dark:text-gray-500',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
          {selected ? format(selected, 'MMM d, yyyy') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : '')}
          disabled={disabledMatcher}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
