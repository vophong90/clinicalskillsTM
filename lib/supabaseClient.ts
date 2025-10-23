// File: lib/supabase-admin.ts
import 'server-only';                    // ✅ chặn import từ client
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;   // ✅ server-only (trùng giá trị NEXT_PUBLIC_SUPABASE_URL)
const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // ✅ tuyệt đối KHÔNG public

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
}

export function getAdminClient() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,          // ✅ server không cần auto refresh
    },
    // db: { schema: 'public' },        // (tuỳ chọn) nếu bạn muốn cố định schema
  });
}
