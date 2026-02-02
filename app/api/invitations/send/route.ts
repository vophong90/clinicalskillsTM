// File: app/api/invitations/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { renderEmailFromTemplate, sendEmail } from '@/lib/email';

const BATCH_SIZE = 500;

type AppRole = 'admin' | 'secretary' | 'viewer' | 'core_expert' | 'external_expert';

function isAppRole(x: any): x is AppRole {
  return ['admin', 'secretary', 'viewer', 'core_expert', 'external_expert'].includes(String(x));
}

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  const body: {
    profile_ids: string[];
    round_ids: string[];
    mode: 'invite' | 'remind';
    email: { subject: string; html: string };

    // NEW
    default_invite_role?: AppRole;               // role mặc định nếu page không gửi per-user
    invite_roles?: Record<string, AppRole>;      // profile_id -> role
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
  if (body.mode !== 'invite' && body.mode !== 'remind') {
    return NextResponse.json({ error: 'mode must be invite|remind' }, { status: 400 });
  }

  const defaultInviteRole: AppRole = isAppRole(body.default_invite_role)
    ? body.default_invite_role
    : 'external_expert';

  const inviteRolesRaw = body.invite_roles || {};

  // ===== Load rounds + projects =====
  const { data: rounds, error: er } = await s.from('rounds').select('id, project_id, round_number');
  if (er) return NextResponse.json({ error: er.message }, { status: 500 });

  const { data: projects, error: ep } = await s.from('projects').select('id, title');
  if (ep) return NextResponse.json({ error: ep.message }, { status: 500 });

  const roundMap = new Map((rounds || []).map((r) => [r.id, r] as const));
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

  const projectIds = Array.from(new Set(selectedRounds.map((r) => r.project_id).filter(Boolean)));

  // ===== Load profiles người nhận =====
  const { data: profs, error: epr } = await s
    .from('profiles')
    .select('id, email, name, role')
    .in('id', body.profile_ids);

  if (epr) return NextResponse.json({ error: epr.message }, { status: 500 });
  if (!profs || profs.length === 0) {
    return NextResponse.json({ ok: false, results: [], message: 'No profiles found' });
  }

  const roleForUser = (userId: string): AppRole => {
    const chosen = inviteRolesRaw[userId];
    return isAppRole(chosen) ? chosen : defaultInviteRole;
  };

  // ============================
  // 1) INVITE MODE: round_participants + permissions(role=5 values) + profiles.role
  // ============================
  if (body.mode === 'invite') {
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

    // 1.2) permissions: đảm bảo mỗi user chỉ có 1 role/project (xóa cũ rồi insert mới)
    if (projectIds.length > 0) {
      const userIds = profs.map((u) => u.id);

      // Xóa tất cả role cũ trong 5 role (để tránh 1 user có nhiều role trong cùng project)
      const { error: delErr } = await s
        .from('permissions')
        .delete()
        .in('user_id', userIds)
        .in('project_id', projectIds)
        .in('role', ['admin', 'secretary', 'viewer', 'core_expert', 'external_expert']);

      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

      // Insert role mới theo lựa chọn
      const permRows: { user_id: string; project_id: string; role: AppRole }[] = [];
      for (const u of profs) {
        const r = roleForUser(u.id);
        for (const pid of projectIds) {
          permRows.push({ user_id: u.id, project_id: pid, role: r });
        }
      }

      for (let i = 0; i < permRows.length; i += BATCH_SIZE) {
        const batch = permRows.slice(i, i + BATCH_SIZE);
        const { error } = await s.from('permissions').insert(batch);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // 1.3) profiles.role
    const updates = profs.map((u) => ({ id: u.id, role: roleForUser(u.id) }));

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const { error } = await s.from('profiles').upsert(batch, { onConflict: 'id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ============================
  // 2) Gửi email + log
  // ============================
  const results: any[] = [];

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

      const invite_role = body.mode === 'invite' ? roleForUser(u.id) : null;

      await s.from('email_log').insert({
        to_email: u.email,
        subject: body.email.subject,
        meta: {
          profile_id: u.id,
          round_ids: body.round_ids,
          mode: body.mode,
          invite_role,
          default_invite_role: body.mode === 'invite' ? defaultInviteRole : null,
        },
        profile_id: u.id,
        round_ids: body.round_ids,
        mode: body.mode,
        provider_message_id: (se as any)?.data?.id || null,
      });

      results.push({ email: u.email, ok: true, invite_role });
      await new Promise((r) => setTimeout(r, 80));
    } catch (err: any) {
      results.push({ email: u.email, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
