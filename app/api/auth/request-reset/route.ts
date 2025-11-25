import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  // 1. tìm user trong Supabase Auth
  const { data: users, error: userError } = await supabase
    .from("auth.users")
    .select("id,email")
    .eq("email", email)
    .maybeSingle();

  if (!users) {
    return NextResponse.json({ message: "If the email exists, a reset link was sent." });
  }

  const userId = users.id;

  // 2. Tạo token random
  const token = crypto.randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min

  // 3. Lưu token vào DB
  await supabase.from("password_resets").insert({
    user_id: userId,
    token,
    expires_at
  });

  // 4. Gửi email qua Resend
  await resend.emails.send({
    from: "support@myapp.com",
    to: email,
    subject: "Reset password",
    html: `
      <p>Click liên kết sau để đặt lại mật khẩu:</p>
      <a href="${process.env.APP_URL}/reset-password?token=${token}">Reset Password</a>
      <p>Liên kết sẽ hết hạn trong 30 phút.</p>
    `,
  });

  return NextResponse.json({ message: "Email sent" });
}
