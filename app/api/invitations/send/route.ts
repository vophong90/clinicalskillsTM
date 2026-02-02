// File: app/api/invitations/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { renderEmailFromTemplate, sendEmail } from '@/lib/email';

const BATCH_SIZE = 500;

type InviteRole = 'core_expert' | 'external_expert';

function isInviteRole(x: any): x is InviteRole {
  return x === 'core_expert' || x === 'external_expert';
}

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  const body: {
    profile_ids: string[]; // danh sách người nhận
    round_ids: string[]; // mời/nhắc theo các vòng đã chọn (có thể nhiều project)
    mode: 'invite' | 'remind';
    email: { subject: string; html: string };

    // ✅ NEW
    invite_roles?: Record<string, InviteRole>; // map profile_id -> role
    default_invite_role?: InviteRole; // fallback nếu không có invite_roles[id]
  } = await req.json();

  if (!Array.isArray(body.profile_ids) || body.profile_ids.length === 0) {
    return NextResponse.json({ error: 'profile_ids[] required' }, { status: 400 });
  }
  if (!Array.isArray(body.round_ids) || body.round_ids.length === 0) {
    return NextResponse.json({ error: 'round_ids[] required' }, { status: 400 });
  }
  if (!body.email?.subject || !body.email?.html) {
    return NextResponse.json({ error: 'email.subject & email.html required' }, { status: 400 });
  }

  // Validate roles payload (nếu có)
  if (body.mode === 'invite') {
    if (body.default_invite_role && !isInviteRole(body.default_invite_role)) {
      return NextResponse.json({ error: 'default_invite_role invalid' }, { status: 400 });
    }
    if (body.invite_roles) {
      for (const [pid, role] of Object.entries(body.invite_roles)) {
        if (!pid || !isInviteRole(role)) {
          return NextResponse.json({ error: `invite_roles invalid at profile_id=${pid}` }, { status: 400 });
        }
      }
    }
  }

  // ============================
  // Load rounds/projects (chỉ lấy những cái cần)
  // ============================
  const { data: rounds, error: er } = await s
    .from('rounds')
    .select('id, project_id, round_number')
    .in('id', body.round_ids);

  if (er) return NextResponse.json({ error: er.message }, { status: 500 });

  const roundMap = new Map((rounds || []).map((r) => [r.id, r] as const));

  // Lấy project ids từ rounds đã chọn
  const projectIds = Array.from(
    new Set(
      (rounds || [])
        .map((r) => r.project_id)
        .filter(Boolean) as string[]
    )
  );

  const { data: projects, error: ep } = await s
    .from('projects')
    .select('id, title')
    .in('id', projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']); // tránh in([])
  if (ep) return NextResponse.json({ error: ep.message }, { status: 500 });

  const projectMap = new Map((projects || []).map((p) => [p.id, p] as const));

  const selectedRounds = body.round_ids
    .map((rid) => {
      const r = roundMap.get(rid);
      if (!r) return null;
      const p = projectMap.get(r.project_id);
      return {
        id: rid,
        project_id: r.project_id,
        project_title: p?.title || '',
        round_label: `V${r.round_number}`,
      };
    })
    .filter(Boolean) as {
    id: string;
    project_id: string;
    project_title: string;
    round_label: string;
  }[];

  // ============================
  // Load profiles người nhận
  // ============================
  const { data: profs, error: epr } = await s
    .from('profiles')
    .select('id, email, name')
    .in('id', body.profile_ids);

  if (epr) return NextResponse.json({ error: epr.message }, { status: 500 });
  if (!profs || profs.length === 0) {
    return NextResponse.json({ ok: false, results: [], message: 'No profiles found' });
  }

  // helper: role sẽ gán cho 1 profile (chỉ dùng khi invite)
  const defaultRole: InviteRole = body.default_invite_role && isInviteRole(body.default_invite_role)
    ? body.default_invite_role
    : 'external_expert';

  function roleForProfile(profileId: string): InviteRole {
    const r = body.invite_roles?.[profileId];
    return isInviteRole(r) ? r : defaultRole;
  }

  // ============================
  // 1) Nếu mode=invite: update role + upsert round_participants + permissions
  // ============================
  if (body.mode === 'invite') {
    // 1.0) UPDATE profiles.role theo lựa chọn (bulk theo role)
    const idsCore: string[] = [];
    const idsExternal: string[] = [];

    for (const u of profs) {
      const r = roleForProfile(u.id);
      if (r === 'core_expert') idsCore.push(u.id);
      else idsExternal.push(u.id);
    }

    if (idsCore.length) {
      const { error } = await s.from('profiles').update({ role: 'core_expert' }).in('id', idsCore);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (idsExternal.length) {
      const { error } = await s.from('profiles').update({ role: 'external_expert' }).in('id', idsExternal);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 1.1) round_participants
    const rpRows: { user_id: string; round_id: string }[] = [];
    for (const u of profs) {
      for (const rid of body.round_ids) {
        rpRows.push({ user_id: u.id, round_id: rid });
      }
    }

    for (let i = 0; i < rpRows.length; i += BATCH_SIZE) {
      const batch = rpRows.slice(i, i + BATCH_SIZE);
      const { error } = await s.from('round_participants').upsert(batch, { onConflict: 'round_id,user_id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 1.2) permissions theo role đã chọn cho các project liên quan
    if (projectIds.length > 0) {
      const permRows: { user_id: string; project_id: string; role: InviteRole }[] = [];
      for (const u of profs) {
        const role = roleForProfile(u.id);
        for (const pid of projectIds) {
          permRows.push({ user_id: u.id, project_id: pid, role });
        }
      }

      for (let i = 0; i < permRows.length; i += BATCH_SIZE) {
        const batch = permRows.slice(i, i + BATCH_SIZE);
        const { error } = await s.from('permissions').upsert(batch, { onConflict: 'user_id,project_id,role' });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  // ============================
  // 2) Gửi email + log (theo từng user)
  // ============================
  const results: Array<{ email: string; ok: boolean; error?: string }> = [];

  for (const u of profs) {
    try {
      const html = renderEmailFromTemplate({
        rawHtml: body.email.html,
        fullName: u.name || u.email,
        email: u.email,
        rounds: selectedRounds.map((r) => ({
          project_title: r.project_title,
          round_label: r.round_label,
        })),
      });

      const se = await sendEmail({
        to: u.email,
        subject: body.email.subject,
        html,
      });

      // log (không chặn nếu log fail)
      const { error: logErr } = await s.from('email_log').insert({
        to_email: u.email,
        subject: body.email.subject,
        meta: {
          profile_id: u.id,
          round_ids: body.round_ids,
          mode: body.mode,
          invite_role: body.mode === 'invite' ? roleForProfile(u.id) : null,
        },
        profile_id: u.id,
        round_ids: body.round_ids,
        mode: body.mode,
        provider_message_id: (se as any)?.data?.id || null,
      });

      if (logErr) {
        // không fail toàn bộ, chỉ ghi nhận
        console.warn('email_log insert error:', logErr.message);
      }

      results.push({ email: u.email, ok: true });

      // pacing nhẹ để tránh spam provider
      await new Promise((r) => setTimeout(r, 80));
    } catch (err: any) {
      results.push({ email: u.email, ok: false, error: String(err?.message || err) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
