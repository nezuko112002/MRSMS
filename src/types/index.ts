// ============================================================
// Database Types — mirrors Supabase schema
// ============================================================

export type UserRole = 'requestor' | 'manager' | 'warehouse' | 'finance' | 'admin';

export type RequestStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'partially_approved'
  | 'rejected'
  | 'released'
  | 'partially_released'
  | 'confirmed'
  | 'completed';

export type ItemStatus = 'pending' | 'approved' | 'rejected' | 'released' | 'received';
export type ReleaseStatus = 'complete' | 'partial';
export type ConditionStatus = 'good' | 'damaged' | 'incomplete';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  department: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialRequest {
  id: string;
  request_no: string;
  project_id: string | null;
  project_name: string;
  department: string | null;
  requested_by: string;
  required_date: string | null;
  purpose: string | null;
  status: RequestStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  profile?: Profile;
  project?: Project;
  items?: MaterialRequestItem[];
}

export interface MaterialRequestItem {
  id: string;
  request_id: string;
  item_code: string | null;
  description: string;
  unit: string;
  requested_qty: number;
  approved_qty: number | null;
  released_qty: number | null;
  received_qty: number | null;
  purpose: string | null;
  reject_reason: string | null;
  release_deferred?: boolean;
  status: ItemStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalHistory {
  id: string;
  request_id: string;
  action_by: string;
  action: string;
  comments: string | null;
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  created_at: string;
  // Join
  profile?: Profile;
}

export interface MaterialReleaseSlip {
  id: string;
  slip_no: string;
  request_id: string;
  released_by: string;
  release_date: string;
  status: ReleaseStatus;
  notes: string | null;
  created_at: string;
  // Joins
  request?: MaterialRequest;
  profile?: Profile;
}

export interface CostRecord {
  id: string;
  request_id: string;
  item_id: string;
  project_name: string;
  description: string;
  qty: number;
  unit_cost: number;
  total_cost: number;
  recorded_at: string;
  recorded_by: string | null;
}

// ============================================================
// UI / Form types
// ============================================================

export interface RequestFormItem {
  id: string; // temp client-side ID
  description: string;
  unit: string;
  requested_qty: number | string;
  purpose: string;
}

export interface DashboardStats {
  totalRequests: number;
  pendingApprovals: number;
  monthlySpend: number;
}
