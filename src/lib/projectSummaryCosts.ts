import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectSummaryMaterialLine } from '@/lib/projectSummaryPrint';

export type ProjectSummaryCostRow = {
  key: string;
  line: ProjectSummaryMaterialLine;
  unitCost: number | null;
};

export async function fetchCostsByItemIds(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Record<string, number>> {
  if (!itemIds.length) return {};

  const { data, error } = await supabase
    .from('cost_records')
    .select('item_id, unit_cost')
    .in('item_id', itemIds);

  if (error) throw error;

  const costs: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.item_id && row.unit_cost != null) {
      costs[row.item_id] = Number(row.unit_cost);
    }
  }
  return costs;
}

export async function saveProjectSummaryCosts(
  supabase: SupabaseClient,
  projectName: string,
  rows: ProjectSummaryCostRow[],
  recordedBy: string | null,
) {
  const upserts: Array<{
    request_id: string;
    item_id: string;
    project_name: string;
    description: string;
    qty: number;
    unit_cost: number;
    recorded_by: string | null;
  }> = [];

  const deleteItemIds: string[] = [];

  for (const row of rows) {
    const { line, unitCost } = row;
    if (!line.request_id || !line.item_id) continue;

    if (unitCost != null) {
      upserts.push({
        request_id: line.request_id,
        item_id: line.item_id,
        project_name: projectName,
        description: line.description,
        qty: line.released_qty,
        unit_cost: unitCost,
        recorded_by: recordedBy,
      });
    } else {
      deleteItemIds.push(line.item_id);
    }
  }

  if (deleteItemIds.length) {
    const { error } = await supabase.from('cost_records').delete().in('item_id', deleteItemIds);
    if (error) throw error;
  }

  if (upserts.length) {
    const { error } = await supabase.from('cost_records').upsert(upserts, { onConflict: 'item_id' });
    if (error) throw error;
  }
}
