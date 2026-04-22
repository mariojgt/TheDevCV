import { supabase } from '../../../lib/supabase';

/**
 * Client-side tracking for CV events. Server-side in record_cv_event():
 *   - 'view'     is also written automatically inside get_shared_cv()
 *   - 'download' must be recorded by the client after a successful export
 *
 * All calls are fire-and-forget — they never throw, never block the UI.
 * If analytics break, the feature they measure must still work.
 */

export interface CVStats {
  views: number;
  views_30d: number;
  downloads: number;
  applications: number;
  responses: number;
  interviews: number;
  offers: number;
  /** 0–100 integer percentage. 0 when applications = 0. */
  response_rate: number;
  last_view: string | null;
}

export async function recordCVEvent(
  profileId: string,
  eventType: 'view' | 'download',
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.rpc('record_cv_event', {
      p_profile_id: profileId,
      p_event_type: eventType,
      p_metadata: metadata,
    });
  } catch {
    // Silent — analytics failures must never interrupt the caller.
  }
}

export async function getCVStats(profileId: string): Promise<CVStats | null> {
  const { data, error } = await supabase.rpc('get_cv_stats', { p_profile_id: profileId });
  if (error || !data) return null;
  return data as CVStats;
}
