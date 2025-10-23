// File: app/api/invitations/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { renderEmailFromTemplate, sendEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const s = getAdminClient();
  const body: {
    profile_ids: string[];       // danh sách người nhận
    round_ids: string[];         // mời/nhắc theo các vòng đã chọn (có thể nhiều project)
    mode: 'invite'|'remind';
    email: { subject: string; html: string };
  } = await req.json();

  if (!Array.isArray(body.profile_ids) || body.profile_ids.length===0) return NextResponse.json({ error:'profile_ids[] required' }, { status:400 });
  if (!Array.isArray(body.round_ids) || body.round_ids.length===0) return NextResponse.json({ error:'round_ids[] required' }, { status:400 });
  if (!body.email?.subject || !body.email?.html) return NextResponse.json({ error:'email.subject & email.html required' }, { status:400 });

  // Lấy info rounds -> project_title + label V{round_number}
  const { data: rounds, error: er } = await s.from('rounds').select('id, project_id, round_number');
  if (er) return NextResponse.json({ error: er.message }, { status:500 });
  const { data: projects, error: ep } = await s.from('projects').select('id, title');
  if (ep) return NextResponse.json({ error: ep.message }, { status:500 });

  const roundMap = new Map(rounds?.map(r=>[r.id, r] as const));
  const projectMap = new Map(projects?.map(p=>[p.id, p] as const));

  const selectedRounds = body.round_ids.map(rid => {
    const r = roundMap.get(rid)!;
    const p = r ? projectMap.get(r.project_id) : null;
    return { id: rid, project_id: r?.project_id, project_title: p?.title||'', round_label: `V${r?.round_number||''}` };
  }).filter(x=>x.id);

  // Chuẩn bị danh sách project_id cần auto-add permissions
  const projectIds = Array.from(new Set(selectedRounds.map(r=>r.project_id).filter(Boolean) as string[]));

  // Lấy profiles người nhận
  const { data: profs, error: epr } = await s.from('profiles').select('id, email, name').in('id', body.profile_ids);
  if (epr) return NextResponse.json({ error: epr.message }, { status:500 });

  const results: any[] = [];
  for (const u of (profs||[])) {
    try {
      if (body.mode === 'invite') {
        // 1) Thêm vào round_participants (bỏ qua trùng)
        for (const rid of body.round_ids) {
          await s.from('round_participants').upsert({ id: crypto.randomUUID(), user_id: u.id, round_id: rid }, { onConflict:'round_id,user_id' });
          await new Promise(r=>setTimeout(r, 10));
        }
        // 2) Auto-add permissions (role external_expert) cho mọi project liên quan
        for (const pid of projectIds) {
          await s.from('permissions').upsert({ id: crypto.randomUUID(), user_id: u.id, project_id: pid, role: 'external_expert' }, { onConflict: 'user_id,project_id,role' });
          await new Promise(r=>setTimeout(r, 10));
        }
      }

      // Render email 1 người, liệt kê tất cả rounds
      const html = renderEmailFromTemplate({ rawHtml: body.email.html, fullName: u.name||u.email, email: u.email, rounds: selectedRounds.map(r=>({ project_title:r.project_title, round_label:r.round_label })) });
      const se = await sendEmail({ to: u.email, subject: body.email.subject, html });

      // (Optional) log
      await s.from('email_log').insert({ to_email: u.email, subject: body.email.subject, meta: { profile_id: u.id, round_ids: body.round_ids, mode: body.mode }, provider_message_id: (se as any)?.data?.id || null });

      results.push({ email: u.email, ok:true });
      // pacing nhẹ
      await new Promise(r=>setTimeout(r, 120));
    } catch (err:any) {
      results.push({ email: u.email, ok:false, error: String(err) });
    }
  }

  return NextResponse.json({ ok:true, results });
}
