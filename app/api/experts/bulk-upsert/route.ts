// File: app/api/experts/bulk-upsert/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

// Tìm userId trong Auth bằng listUsers (fallback khi email đã tồn tại)
async function findAuthUserIdByEmail(s: ReturnType<typeof getAdminClient>, email: string) {
  const PER_PAGE = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await s.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const found = data?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found.id as string;
    if (!data?.users?.length || data.users.length < PER_PAGE) break;
  }
  return null;
}

// Đảm bảo có auth.users + profiles (role external_expert) và trả về userId
async function ensureAuthAndProfile(
  s: ReturnType<typeof getAdminClient>,
  email: string,
  fullName: string
) {
  // 1) Tìm profile theo email trước (rẻ + nhanh)
  const prof = await s.from('profiles').select('id').eq('email', email).maybeSingle();
  if (prof.data?.id) return prof.data.id as string;

  // 2) Tạo user trong Auth (auto confirm email)
  const { data: created, error: createErr } = await s.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: fullName },
  });

  let userId: string | null = created?.user?.id ?? null;

  // 3) Nếu email đã tồn tại → fallback listUsers để lấy id
  if (!userId && createErr) {
    const byEmail = await findAuthUserIdByEmail(s, email);
    if (byEmail) userId = byEmail;
  }

  if (!userId) {
    throw new Error(`Không thể xác định userId cho ${email}: ${createErr?.message || 'unknown'}`);
  }

  // 4) Tạo/ghép profiles (id khớp auth.users.id)
  const { error: upErr } = await s
    .from('profiles')
    .upsert(
      { id: userId, email, name: fullName, role: 'external_expert' },
      { onConflict: 'id' }
    );
  if (upErr) throw upErr;

  return userId;
}

export async function POST(req: Request) {
  const s = getAdminClient();

  const body = await req.json().catch(() => ({}));
  const experts = Array.isArray(body?.experts) ? body.experts : [];

  if (!experts.length) {
    return NextResponse.json({ error: 'experts[] is required' }, { status: 400 });
  }

  const details: any[] = [];
  let upserted = 0;

  for (const raw of experts) {
    const full_name = String(raw?.full_name || raw?.name || '').trim();
    const email = String(raw?.email || '').trim().toLowerCase();
    const org = raw?.org ?? null;
    const title = raw?.title ?? null;
    const phone = raw?.phone ?? null;

    if (!full_name || !email) {
      details.push({ email, skipped: true, reason: 'missing full_name/email' });
      continue;
    }

    try {
      // Bảo đảm có auth user + profile
      const userId = await ensureAuthAndProfile(s, email, full_name);

      // Upsert external_experts (email unique/citext), map user_id
      const { error: extErr } = await s
        .from('external_experts')
        .upsert(
          {
            full_name,
            email,
            org,
            title,
            phone,
            user_id: userId,
            is_active: true,
          },
          { onConflict: 'email' }
        );

      if (extErr) throw extErr;

      upserted++;
      details.push({ email, created_profile: true, user_id: userId, ok: true });
    } catch (e: any) {
      details.push({ email, ok: false, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({ upserted, details });
}
