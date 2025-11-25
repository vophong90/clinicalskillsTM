// app/api/auth/request-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

// Admin client dùng service role
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,                // <-- env của bạn trên Vercel
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   // <-- đúng tên env
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: NextRequest) {
  let body: { email?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // 1. Tìm user trong Supabase Auth
  const { data: user, error: userError } = await supabaseAdmin
    .from("auth.users")
    .select("id,email")
    .eq("email", email)
    .maybeSingle();

  // Không lộ thông tin email có tồn tại hay không
  if (userError) {
    console.error("Error fetching user:", userError);
    return NextResponse.json(
      { message: "If the email exists, a reset link was sent." },
      { status: 200 }
    );
  }

  if (!user) {
    return NextResponse.json(
      { message: "If the email exists, a reset link was sent." },
      { status: 200 }
    );
  }

  const userId = user.id;

  // 2. Tạo token random
  const token = crypto.randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 phút

  // 3. Lưu token vào DB
  const { error: insertError } = await supabaseAdmin
    .from("password_resets")
    .insert({
      user_id: userId,
      token,
      expires_at,
    });

  if (insertError) {
    console.error("Error inserting reset token:", insertError);
    // Vẫn trả về message chung chung
    return NextResponse.json(
      { message: "If the email exists, a reset link was sent." },
      { status: 200 }
    );
  }

  // 4. Gửi email qua Resend
  const appUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://clinicalskills-tm.vercel.app";

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM!, // ví dụ: "Clinical Skills TM <no-reply@...>"
      to: email,
      subject: "Đặt lại mật khẩu",
      html: `
        <p>Chào bạn,</p>
        <p>Nhấn vào liên kết sau để đặt lại mật khẩu cho tài khoản của bạn:</p>
        <p>
          <a href="${appUrl}/auth/update-password?token=${token}">
            Đặt lại mật khẩu
          </a>
        </p>
        <p>Liên kết này có hiệu lực trong 30 phút.</p>
        <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
      `,
    });
  } catch (err) {
    console.error("Error sending reset email via Resend:", err);
    // Không báo lỗi cụ thể cho client, tránh lộ thông tin
  }

  // Luôn trả về message giống nhau để tránh lộ email tồn tại hay không
  return NextResponse.json({
    message: "If the email exists, a reset link was sent.",
  });
}
