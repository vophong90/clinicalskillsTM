// File: lib/supabase-admin.ts  (CHỈ import ở server: app/api/* hoặc server actions)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

// Chặn misuse: nếu lỡ import từ client, ném lỗi
if (typeof window !== 'undefined') {
  throw new Error('getAdminClient() must only be used on the server');
}

export function getAdminClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
