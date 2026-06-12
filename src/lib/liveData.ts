import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export const LIVE_DATA_BROADCAST_EVENT = 'refresh';
const LIVE_DATA_BROADCAST_CHANNEL = 'mrsms-broadcast';

let broadcastChannel: RealtimeChannel | null = null;

/** Subscribe to cross-client refresh signals (used by LiveDataProvider). */
export function bindLiveDataBroadcast(
  supabase: SupabaseClient,
  onRefresh: () => void
): () => void {
  if (broadcastChannel) {
    void supabase.removeChannel(broadcastChannel);
  }

  broadcastChannel = supabase.channel(LIVE_DATA_BROADCAST_CHANNEL);
  broadcastChannel.on('broadcast', { event: LIVE_DATA_BROADCAST_EVENT }, onRefresh);
  broadcastChannel.subscribe();

  return () => {
    if (broadcastChannel) {
      void supabase.removeChannel(broadcastChannel);
      broadcastChannel = null;
    }
  };
}

/** Tell every open app tab / user to reload lists immediately. */
export function notifyLiveDataChange(supabase: SupabaseClient) {
  if (!broadcastChannel) return;
  void broadcastChannel.send({
    type: 'broadcast',
    event: LIVE_DATA_BROADCAST_EVENT,
    payload: { at: Date.now() },
  });
}
