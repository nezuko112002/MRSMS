'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let query = supabase.from('projects').select('*').order('name');
      if (activeOnly) query = query.eq('is_active', true);
      const { data } = await query;
      if (!cancelled) {
        setProjects(data || []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [supabase, activeOnly]);

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
