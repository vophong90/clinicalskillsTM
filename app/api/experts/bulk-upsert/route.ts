// File: app/api/experts/bulk-upsert/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const s = getAdminClient();
  const body = await req.json();
  const input = (body?.experts||[]) as Array<{full_name:string; email:string; org?:string|null; title?:string|null; phone?:string|null}>;
  if (!Array.isArray(input) || input.length===0) return NextResponse.json({ error:'experts[] required' }, { status:400 });

  const cleaned = input.map(x=>({
    full_name: (x.full_name||'').trim(),
    email: (x.email||'').trim().toLowerCase(),
    org: x.org||null, title: x.title||null, phone: x.phone||null
  })).filter(x=>x.full_name && x.email);

  // Upsert external_experts theo email
  const { data: up, error: e0 } = await s.from('external_experts').upsert(cleaned, { onConflict:'email' }).select('id,email');
  if (e0) return NextResponse.json({ error: e0.message }, { status:500 });

  // Tạo auth.users + profiles nếu chưa có
  const results: any[] = [];
  for (const ex of cleaned) {
    // Check user by email
    let userId: string | null = null;
    try {
      const get = await s.auth.admin.getUserByEmail(ex.email);
      if (get?.data?.user) {
        userId = get.data.user.id;
      } else {
        const created = await s.auth.admin.createUser({ email: ex.email, email_confirm: true });
        userId = created.data.user?.id || null;
      }
    } catch (err:any) {
      results.push({ email: ex.email, created_profile: false, error: 'auth '+String(err) });
      continue;
    }

    if (!userId) { results.push({ email: ex.email, created_profile:false, error:'no user id' }); continue; }

    // Upsert profiles
    const prof = { id: userId, email: ex.email, name: ex.full_name, role: 'external_expert' } as any;
    const { error: e1 } = await s.from('profiles').upsert(prof, { onConflict: 'id' });
    if (e1) { results.push({ email: ex.email, created_profile:false, error:e1.message }); continue; }

    // Link về external_experts.user_id nếu cần
    await s.from('external_experts').update({ user_id: userId }).eq('email', ex.email);
    results.push({ email: ex.email, created_profile:true });

    // Pacing nhẹ tránh rate-limit
    await new Promise(r=>setTimeout(r, 60));
  }

  return NextResponse.json({ ok:true, upserted: up?.length||0, details: results });
}
