// File: app/api/email/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const s = getAdminClient();
  const { profile_ids, round_ids } = await req.json();

  if (!Array.isArray(profile_ids) || profile_ids.length === 0) {
    return NextResponse.json({ error: 'profile_ids[] required' }, { status: 400 });
  }
  if (!Array.isArray(round_ids) || round_ids.length === 0) {
    return NextResponse.json({ error: 'round_ids[] required' }, { status: 400 });
  }

  const PAGE_SIZE = 1000;
  let from = 0;
  let all: any[] = [];

  while (true) {
    const { data, error } = await s
      .from('email_log')
      .select('profile_id, sent_at, status, mode, round_ids')
      .eq('status', 'sent')
      .eq('mode', 'invite')
      .overlaps('round_ids', round_ids)
      .in('profile_id', profile_ids)
      .order('sent_at', { ascending: false })  // mới nhất trước
      .range(from, from + PAGE_SIZE - 1);      // 🔁 phân trang

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;        // đã hết
    from += PAGE_SIZE;
  }

  // gom thành map profile_id → last sent_at
  const map: Record<string, string> = {};
  for (const row of all) {
    const pid = row.profile_id as string | null;
    const sentAt = row.sent_at as string | null;
    if (!pid || !sentAt) continue;
    if (!map[pid]) map[pid] = sentAt;         // vì all đã sort DESC
  }

  return NextResponse.json({ stats: map });
}
