// File: app/api/surveys/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const s = getAdminClient();
  const url = new URL(req.url);
  const projectId = url.searchParams.get('project_id');
  const roundId = url.searchParams.get('round_id');
  const status = url.searchParams.get('status'); // 'submitted' | 'invited'

  const PAGE_SIZE = 1000;

  // =========================
  // 1) Lấy TẤT CẢ participants bằng phân trang
  // =========================
  let participants: { round_id: string; user_id: string; created_at: string }[] = [];
  let from = 0;

  while (true) {
    let q = s
      .from('round_participants')
      .select('round_id, user_id, created_at')
      .range(from, from + PAGE_SIZE - 1); // phân trang

    if (roundId) q = q.eq('round_id', roundId);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) break;

    participants.push(...data);

    // nếu trả về ít hơn PAGE_SIZE thì đã hết dữ liệu
    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  // Nếu không có participant nào thì trả luôn cho nhanh
  if (!participants.length) {
    return NextResponse.json({ items: [] });
  }

  // Lọc theo project nếu có projectId (giữ nguyên logic cũ)
  const roundIdsAll = Array.from(new Set(participants.map(x => x.round_id)));

  if (projectId) {
    const { data: rounds, error: eRounds } = await s
      .from('rounds')
      .select('id')
      .eq('project_id', projectId);

    if (eRounds) {
      return NextResponse.json({ error: eRounds.message }, { status: 500 });
    }

    const okRounds = new Set((rounds || []).map(r => r.id));
    participants = participants.filter(p => okRounds.has(p.round_id));
  }

  // Sau khi lọc project, tính lại roundIds để dùng cho các query tiếp theo
  const roundIds = Array.from(new Set(participants.map(x => x.round_id)));

  if (!roundIds.length) {
    // Có participants nhưng sau khi lọc theo project thì không còn gì
    return NextResponse.json({ items: [] });
  }

  // =========================
// 2) Map thông tin rounds, projects, profiles
// =========================
const { data: rounds2, error: eR2 } = await s
  .from('rounds')
  .select('id, project_id, round_number')
  .in('id', roundIds);

if (eR2) {
  return NextResponse.json({ error: eR2.message }, { status: 500 });
}

const { data: projects, error: ePrj } = await s
  .from('projects')
  .select('id, title');

if (ePrj) {
  return NextResponse.json({ error: ePrj.message }, { status: 500 });
}

// 👉 LẤY CHỈ CÁC PROFILE CẦN THIẾT, THEO TỪNG LÔ
const userIdsAll = Array.from(new Set(participants.map(p => p.user_id)));
const PROFILE_PAGE = 1000;
let allProfiles: { id: string; email: string | null; name: string | null }[] = [];

for (let i = 0; i < userIdsAll.length; i += PROFILE_PAGE) {
  const chunk = userIdsAll.slice(i, i + PROFILE_PAGE);
  const { data, error } = await s
    .from('profiles')
    .select('id, email, name')
    .in('id', chunk);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  allProfiles = allProfiles.concat(data || []);
}

const rmap = new Map((rounds2 || []).map(r => [r.id, r] as const));
const pmap = new Map((projects || []).map(p => [p.id, p] as const));
const umap = new Map((allProfiles || []).map(u => [u.id, u] as const));
 
  // =========================
  // 3) Lấy TẤT CẢ responses is_submitted=true bằng phân trang
  // =========================
  let subs: { user_id: string; round_id: string; updated_at: string }[] = [];
  let fromResp = 0;

  while (true) {
    const { data, error } = await s
      .from('responses')
      .select('user_id, round_id, updated_at')
      .eq('is_submitted', true)
      .in('round_id', roundIds)
      .range(fromResp, fromResp + PAGE_SIZE - 1); // phân trang

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) break;

    subs.push(...data);

    if (data.length < PAGE_SIZE) break;

    fromResp += PAGE_SIZE;
  }

  // =========================
  // 4) Xử lý set submitted / thời gian
  // =========================
  const submittedSet = new Set((subs || []).map(x => `${x.user_id}:${x.round_id}`));
  const submittedTime = new Map<string, string>();

  (subs || []).forEach(x => {
    const k = `${x.user_id}:${x.round_id}`;
    const prev = submittedTime.get(k);
    if (!prev || new Date(x.updated_at).getTime() > new Date(prev).getTime()) {
      submittedTime.set(k, x.updated_at);
    }
  });

  // =========================
  // 5) Build rows kết quả
  // =========================
  const rows = participants
    .map(pa => {
      const r = rmap.get(pa.round_id);
      const prj = r ? pmap.get(r.project_id) : undefined;
      const u = umap.get(pa.user_id);
      const k = `${pa.user_id}:${pa.round_id}`;
      const submitted = submittedSet.has(k);
      const st = submitted ? 'submitted' : 'invited';

      return {
        user_id: pa.user_id,
        user_name: u?.name || u?.email || '',
        email: u?.email || '',
        project_id: prj?.id || '',
        project_title: prj?.title || '',
        round_id: pa.round_id,
        round_label: r ? `V${r.round_number}` : '',
        status: st,
        responded_at: submitted ? submittedTime.get(k) || null : null,
        invited_at: pa.created_at
      };
    })
    .filter(row => !status || row.status === status);

  return NextResponse.json({ items: rows });
}
