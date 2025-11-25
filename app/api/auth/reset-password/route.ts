import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export async function POST(req: NextRequest) {
  const { token, newPassword } = await req.json();

  // 1. Kiểm tra token trong DB
  const { data: resetRow } = await supabase
    .from("password_resets")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!resetRow || new Date(resetRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token invalid or expired" }, { status: 400 });
  }

  const userId = resetRow.user_id;

  // 2. Update password trong Supabase
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // 3. Xóa token đã dùng
  await supabase.from("password_resets").delete().eq("id", resetRow.id);

  return NextResponse.json({ message: "Password updated successfully" });
}
