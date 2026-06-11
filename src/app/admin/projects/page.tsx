'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { DepartmentSelect } from '@/components/ui/department-select';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';
import { FolderKanban, Plus, Edit2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProjectForm {
  name: string;
  department: string;
}

const emptyForm: ProjectForm = { name: '', department: '' };

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('projects').select('*').order('name');
    setProjects(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(project: Project) {
    setEditingId(project.id);
    setForm({ name: project.name, department: project.department || '' });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveProject() {
    if (!form.name.trim()) {
      toast.error('Project name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        department: form.department || null,
      };
      if (editingId) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Project updated');
      } else {
        const { error } = await supabase.from('projects').insert(payload);
        if (error) throw error;
        toast.success('Project created');
      }
      closeForm();
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(project: Project) {
    const { error } = await supabase
      .from('projects')
      .update({ is_active: !project.is_active })
      .eq('id', project.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(project.is_active ? 'Project deactivated' : 'Project activated');
    load();
  }

  const { page, setPage, paginatedItems, totalPages, totalItems, from, to } = usePagination(projects);

  if (loading) return <AppShell title="Projects"><PageLoader /></AppShell>;

  return (
    <AppShell title="Projects">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">Project Management</h2>
            <p className="page-subtitle">{projects.filter(p => p.is_active).length} active projects</p>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Add Project
          </button>
        </div>

        {showForm && (
          <div className="glass-card p-5 mb-5 animate-slide-up">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FolderKanban size={16} className="text-brand-500" />
              {editingId ? 'Edit Project' : 'New Project'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Project Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="glass-input text-sm"
                  placeholder="e.g. School Building Phase 2"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Department</label>
                <DepartmentSelect
                  value={form.department}
                  onChange={department => setForm(p => ({ ...p, department }))}
                  emptyLabel="None"
                  triggerClassName="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={closeForm} className="btn-ghost">Cancel</button>
              <button onClick={saveProject} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        )}

        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <FolderKanban size={16} className="text-brand-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">All Projects</h3>
          </div>
          {projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Add projects so requestors can select them when submitting material requests."
              action={
                <button onClick={openCreate} className="btn-primary text-sm">
                  <Plus size={14} /> Add Project
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="hidden sm:table-cell">Department</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Created</th>
                    <th className="w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(project => (
                    <tr key={project.id}>
                      <td>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{project.name}</p>
                      </td>
                      <td className="hidden sm:table-cell text-sm text-gray-500">
                        {project.department || '—'}
                      </td>
                      <td>
                        <span className={`badge ${project.is_active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                          {project.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="hidden md:table-cell text-xs text-gray-400">
                        {formatDate(project.created_at)}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(project)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-brand-400/10"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => toggleActive(project)}
                            className={`p-1.5 rounded-lg ${project.is_active ? 'text-red-400 hover:bg-red-400/10' : 'text-emerald-400 hover:bg-emerald-400/10'}`}
                            title={project.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {project.is_active ? <X size={14} /> : <Check size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={totalItems}
                from={from}
                to={to}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
