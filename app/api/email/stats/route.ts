// File: app/api/email/stats/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  const body = await req.json().catch(() => ({}));
  const round_ids: string[] = Array.isArray(body.round_ids) ? body.round_ids : [];

  if (!round_ids.length) {
    return NextResponse.json(
      { error: 'round_ids[] là bắt buộc', stats: {} },
      { status: 400 }
    );
  }

  // RPC trả về: [{ profile_id, sent_at }, ...]
  const { data, error } = await s.rpc('email_last_sent_by_rounds', {
    p_round_ids: round_ids,
  });

  if (error) {
    return NextResponse.json({ error: error.message, stats: {} }, { status: 500 });
  }

  const stats: Record<string, string> = {};
  for (const row of (data as any[]) || []) {
    if (!row?.profile_id || !row?.sent_at) continue;
    stats[String(row.profile_id)] = String(row.sent_at);
  }

  return NextResponse.json({ stats });
}
