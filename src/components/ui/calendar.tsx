'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-2', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium text-gray-900 dark:text-gray-100',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          'absolute left-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100',
          'inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-brand-500/10'
        ),
        button_next: cn(
          'absolute right-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100',
          'inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-brand-500/10'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-gray-500 dark:text-gray-400 rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative',
        day_button: cn(
          'h-9 w-9 p-0 font-normal rounded-lg',
          'text-gray-800 dark:text-gray-100',
          'hover:bg-brand-500/15 hover:text-brand-600 dark:hover:text-brand-300',
          'focus:bg-brand-500/15 focus:text-brand-600 dark:focus:text-brand-300 outline-none'
        ),
        selected: 'bg-brand-600 text-white hover:bg-brand-600 hover:text-white focus:bg-brand-600 focus:text-white',
        today: 'bg-white/10 text-brand-500 font-semibold',
        outside: 'text-gray-400 dark:text-gray-600 opacity-50',
        disabled: 'text-gray-400 opacity-50 cursor-not-allowed',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
