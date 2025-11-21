export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  const body = await req.json().catch(() => ({}));
  const profile_ids: string[] = Array.isArray(body.profile_ids) ? body.profile_ids : [];
  const round_ids: string[] = Array.isArray(body.round_ids) ? body.round_ids : [];

  if (!profile_ids.length || !round_ids.length) {
    return NextResponse.json(
      { error: 'profile_ids[] và round_ids[] là bắt buộc', stats: {} },
      { status: 400 }
    );
  }

  const PAGE = 1000;
  let from = 0;

  const stats: Record<string, string> = {};

  while (true) {
    const { data, error } = await s
      .from('email_log')
      .select('profile_id, sent_at, status, round_ids, mode')
      .eq('status', 'sent')
      .eq('mode', 'invite')
      .overlaps('round_ids', round_ids)
      .in('profile_id', profile_ids)
      .order('sent_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) return NextResponse.json({ error: error.message, stats: {} }, { status: 500 });
    if (!data?.length) break;

    for (const row of data) {
      if (!row.profile_id || !row.sent_at) continue;
      if (!stats[row.profile_id]) stats[row.profile_id] = row.sent_at;
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ stats });
}
