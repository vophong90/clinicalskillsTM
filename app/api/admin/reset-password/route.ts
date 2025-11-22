export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

const DEFAULT_PASSWORD = '12345678@';

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.profile_ids) || body.profile_ids.length === 0) {
    return NextResponse.json(
      { error: 'profile_ids[] là bắt buộc và phải có ít nhất 1 phần tử.' },
      { status: 400 }
    );
  }

  const profile_ids: string[] = body.profile_ids;
  const newPassword: string =
    typeof body.new_password === 'string' && body.new_password.length >= 8
      ? body.new_password
      : DEFAULT_PASSWORD;

  const results: { profile_id: string; ok: boolean; error?: string }[] = [];

  for (const pid of profile_ids) {
    try {
      const { error } = await s.auth.admin.updateUserById(pid, {
        password: newPassword,
      });

      if (error) {
        results.push({ profile_id: pid, ok: false, error: error.message });
      } else {
        results.push({ profile_id: pid, ok: true });
      }
    } catch (e: any) {
      results.push({
        profile_id: pid,
        ok: false,
        error: e?.message || 'Unknown error',
      });
    }
  }

  const success = results.filter((r) => r.ok).length;
  const failed = results.length - success;

  return NextResponse.json({ success, failed, results });
}
