// File: lib/supabase-admin.ts
import { createClient } from '@supabase/supabase-js';

export function getAdminClient() {
  // Chặn nhầm import từ client
  if (typeof window !== 'undefined') {
    throw new Error('getAdminClient() must only be used on the server');
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
