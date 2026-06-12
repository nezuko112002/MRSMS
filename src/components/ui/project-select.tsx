'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Project } from '@/types';

const EMPTY_VALUE = '__none__';

interface ProjectSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  triggerClassName?: string;
  activeOnly?: boolean;
}

export function ProjectSelect({
  value,
  onChange,
  placeholder = 'Select project...',
  triggerClassName,
  activeOnly = true,
}: ProjectSelectProps) {
  const supabase = createClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    let query = supabase.from('projects').select('*').order('name');
    if (activeOnly) query = query.eq('is_active', true);
    const { data } = await query;
    setProjects(data || []);
    setLoading(false);
  }, [supabase, activeOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => load({ silent: true }), true);

  return (
    <Select
      value={value || EMPTY_VALUE}
      onValueChange={(v) => onChange(v === EMPTY_VALUE ? '' : v)}
      disabled={loading}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={loading ? 'Loading projects...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_VALUE}>{placeholder}</SelectItem>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
