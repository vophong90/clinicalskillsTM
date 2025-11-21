// File: app/api/email/stats/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  const body = await req.json().catch(() => ({}));
  const round_ids: string[] = Array.isArray(body.round_ids) ? body.round_ids : [];

  // profile_ids truyền lên không dùng nữa, nhưng vẫn chấp nhận cho "đẹp" body
  // const profile_ids: string[] = Array.isArray(body.profile_ids) ? body.profile_ids : [];

  if (!round_ids.length) {
    return NextResponse.json(
      { error: 'round_ids[] là bắt buộc', stats: {} },
      { status: 400 }
    );
  }

  const PAGE = 1000;
  let from = 0;

  // map: profile_id -> sent_at mới nhất
  const stats: Record<string, string> = {};

  while (true) {
    const { data, error } = await s
      .from('email_log')
      .select('profile_id, sent_at, status, round_ids, mode')
      .eq('status', 'sent')
      .eq('mode', 'invite')
      .overlaps('round_ids', round_ids)
      .order('sent_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message, stats: {} }, { status: 500 });
    }
    if (!data?.length) break;

    for (const row of data) {
      if (!row.profile_id || !row.sent_at) continue;
      // vì đã order desc nên gặp profile_id lần đầu là lần gửi mới nhất
      if (!stats[row.profile_id]) {
        stats[row.profile_id] = row.sent_at as string;
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ stats });
}
