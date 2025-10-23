// File: app/api/surveys/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const s = getAdminClient();
  const url = new URL(req.url);
  const projectId = url.searchParams.get('project_id');
  const roundId = url.searchParams.get('round_id');
  const status = url.searchParams.get('status'); // 'submitted' | 'invited'

  // Lấy participants theo filter
  let q = s
    .from('round_participants')
    .select('round_id, user_id, created_at');
  if (roundId) q = q.eq('round_id', roundId);

  const { data: participants, error: e1 } = await q;
  if (e1) return NextResponse.json({ error: e1.message }, { status:500 });
  const roundIds = Array.from(new Set(participants?.map(x=>x.round_id)||[]));
  if (projectId) {
    // lọc round theo project
    const { data: rounds } = await s.from('rounds').select('id').eq('project_id', projectId);
    const okRounds = new Set((rounds||[]).map(r=>r.id));
    participants?.splice(0, participants.length, ...(participants||[]).filter(p=>okRounds.has(p.round_id)));
  }

  // Map thông tin hiển thị
  const { data: rounds2 } = await s.from('rounds').select('id, project_id, round_number').in('id', roundIds.length?roundIds:['00000000-0000-0000-0000-000000000000']);
  const { data: projects } = await s.from('projects').select('id, title');
  const { data: profiles } = await s.from('profiles').select('id, email, name');
  const rmap = new Map((rounds2||[]).map(r=>[r.id, r] as const));
  const pmap = new Map((projects||[]).map(p=>[p.id, p] as const));
  const umap = new Map((profiles||[]).map(u=>[u.id, u] as const));

  // Lấy submitted theo round_id,user_id (is_submitted=true)
  const { data: subs, error: e2 } = await s
    .from('responses')
    .select('user_id, round_id, updated_at')
    .eq('is_submitted', true)
    .in('round_id', roundIds.length?roundIds:['00000000-0000-0000-0000-000000000000']);
  if (e2) return NextResponse.json({ error: e2.message }, { status:500 });
  const submittedSet = new Set((subs||[]).map(x=>`${x.user_id}:${x.round_id}`));
  const submittedTime = new Map<string,string>();
  (subs||[]).forEach(x=>{
    const k = `${x.user_id}:${x.round_id}`;
    const prev = submittedTime.get(k);
    if (!prev || new Date(x.updated_at).getTime() > new Date(prev).getTime()) submittedTime.set(k, x.updated_at);
  });

  const rows = (participants||[]).map(pa => {
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
      responded_at: submitted ? (submittedTime.get(k) || null) : null,
      invited_at: pa.created_at
    };
  }).filter(row => !status || row.status === status);

  return NextResponse.json({ items: rows });
}
