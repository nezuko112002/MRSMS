'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { RoleBadge } from '@/components/ui/StatusBadge';
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/utils';
import { DepartmentSelect } from '@/components/ui/department-select';
import { RoleSelect } from '@/components/ui/role-select';
import type { Profile, UserRole } from '@/types';
import { Users, UserPlus, Edit2, Check, X, Shield, Send } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ role: UserRole; department: string }>({ role: 'requestor', department: '' });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteData, setInviteData] = useState({ email: '', full_name: '', role: 'requestor' as UserRole, department: '' });
  const [inviting, setInviting] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setUsers(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function saveEdit(id: string) {
    const { error } = await supabase.from('profiles').update(editValues).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('User updated');
    setEditingId(null);
    load();
  }

  async function inviteUser() {
    if (!inviteData.email || !inviteData.full_name) { toast.error('Email and name required'); return; }
    setInviting(true);
    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail(inviteData.email, {
        data: { full_name: inviteData.full_name, role: inviteData.role }
      });
      if (error) throw error;
      toast.success(`Invitation sent to ${inviteData.email}`);
      setShowInvite(false);
      setInviteData({ email: '', full_name: '', role: 'requestor', department: '' });
    } catch {
      // If admin API not available, show helpful message
      toast.error('To invite users, use the Supabase dashboard or enable service role key.');
    } finally {
      setInviting(false);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('profiles').update({ is_active: !current }).eq('id', id);
    toast.success(!current ? 'User activated' : 'User deactivated');
    load();
  }

  const { page, setPage, paginatedItems, totalPages, totalItems, from, to } = usePagination(users);

  if (loading) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell title="Admin">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">User Management</h2>
            <p className="page-subtitle">{users.length} users in the system</p>
          </div>
          <button onClick={() => setShowInvite(s => !s)} className="btn-primary">
            <UserPlus size={16} /> Invite User
          </button>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="glass-card p-5 mb-5 animate-slide-up">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Shield size={16} className="text-brand-500" /> Invite New User
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Full Name *</label>
                <input type="text" value={inviteData.full_name} onChange={e => setInviteData(p => ({ ...p, full_name: e.target.value }))} className="glass-input text-sm" placeholder="Juan dela Cruz" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Email *</label>
                <input type="email" value={inviteData.email} onChange={e => setInviteData(p => ({ ...p, email: e.target.value }))} className="glass-input text-sm" placeholder="user@company.com" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Role</label>
                <RoleSelect
                  value={inviteData.role}
                  onChange={(role) => setInviteData((p) => ({ ...p, role }))}
                  triggerClassName="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Department</label>
                <DepartmentSelect
                  value={inviteData.department}
                  onChange={(department) => setInviteData((p) => ({ ...p, department }))}
                  triggerClassName="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowInvite(false)} className="btn-ghost">Cancel</button>
              <button onClick={inviteUser} disabled={inviting} className="btn-primary">
                <Send size={14} /> {inviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        )}

        {/* Users table */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <Users size={16} className="text-brand-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">All Users</h3>
          </div>
          {users.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th className="hidden sm:table-cell">Department</th>
                    <th className="hidden md:table-cell">Joined</th>
                    <th>Status</th>
                    {me?.role === 'admin' && <th className="w-28">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(user => {
                    const isEditing = editingId === user.id;
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-brand-500">
                                {user.full_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 dark:text-gray-200">{user.full_name}</p>
                              <p className="text-xs text-gray-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isEditing ? (
                            <RoleSelect
                              value={editValues.role}
                              onChange={(role) => setEditValues((p) => ({ ...p, role }))}
                              triggerClassName="h-8 text-xs w-36"
                            />
                          ) : (
                            <RoleBadge role={user.role} />
                          )}
                        </td>
                        <td className="hidden sm:table-cell">
                          {isEditing ? (
                            <DepartmentSelect
                              value={editValues.department}
                              onChange={(department) => setEditValues((p) => ({ ...p, department }))}
                              emptyLabel="None"
                              triggerClassName="h-8 text-xs w-36"
                            />
                          ) : (
                            <span className="text-sm text-gray-500">{user.department || '—'}</span>
                          )}
                        </td>
                        <td className="hidden md:table-cell text-xs text-gray-400">{formatDate(user.created_at)}</td>
                        <td>
                          <span className={`badge ${user.is_active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {me?.role === 'admin' && (
                          <td>
                            {me.id !== user.id && (
                              <div className="flex items-center gap-1">
                                {isEditing ? (
                                  <>
                                    <button onClick={() => saveEdit(user.id)} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10">
                                      <Check size={14} />
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-400/10">
                                      <X size={14} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => { setEditingId(user.id); setEditValues({ role: user.role, department: user.department || '' }); }}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-brand-400/10"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button
                                      onClick={() => toggleActive(user.id, user.is_active)}
                                      className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${user.is_active ? 'text-red-400 hover:bg-red-400/10' : 'text-emerald-400 hover:bg-emerald-400/10'}`}
                                      title={user.is_active ? 'Deactivate' : 'Activate'}
                                    >
                                      {user.is_active ? <X size={14} /> : <Check size={14} />}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
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
