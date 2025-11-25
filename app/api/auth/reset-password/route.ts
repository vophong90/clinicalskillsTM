import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Dùng admin client với SERVICE ROLE
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,               // <-- env của bạn trên Vercel
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // <-- đúng tên env bạn đã đặt
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: NextRequest) {
  let body: { token?: string; newPassword?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { token, newPassword } = body;

  if (!token || !newPassword) {
    return NextResponse.json(
      { error: "Missing token or newPassword" },
      { status: 400 }
    );
  }

  // 1. Kiểm tra token trong DB
  const { data: resetRow, error: resetError } = await supabaseAdmin
    .from("password_resets")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (resetError) {
    console.error("Error fetching reset token:", resetError);
    return NextResponse.json(
      { error: "Server error while checking token" },
      { status: 500 }
    );
  }

  if (!resetRow || new Date(resetRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Token invalid or expired" },
      { status: 400 }
    );
  }

  const userId = resetRow.user_id;

  // 2. Update password trong Supabase Auth
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (updateError) {
    console.error("Error updating user password:", updateError);
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    );
  }

  // 3. Xóa token đã dùng
  const { error: deleteError } = await supabaseAdmin
    .from("password_resets")
    .delete()
    .eq("id", resetRow.id);

  if (deleteError) {
    console.error("Error deleting reset token:", deleteError);
    // Không cần fail request vì password đã đổi thành công rồi
  }

  return NextResponse.json({ message: "Password updated successfully" });
}
