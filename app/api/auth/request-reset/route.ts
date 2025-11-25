import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

// Admin client dùng SERVICE ROLE, bỏ qua RLS
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,               // env bạn đã có trên Vercel
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // env bạn đã có trên Vercel
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

  // 1. Tìm user theo bảng profiles (id = auth.users.id, email)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    console.error("Error fetching profile:", profileError);
    return NextResponse.json(
      { error: "Server error while fetching user." },
      { status: 500 }
    );
  }

  // Không lộ email có tồn tại hay không
  if (!profile) {
    return NextResponse.json({
      message:
        "If the email exists, a reset link was sent.",
    });
  }

  const userId = profile.id;

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
    return NextResponse.json(
      { error: "Server error while creating reset token." },
      { status: 500 }
    );
  }

  // 4. Gửi email qua Resend
  const appUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://clinicalskills-tm.vercel.app";

  try {
    const { error: resendError } = await resend.emails.send({
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

    if (resendError) {
      console.error("Error sending reset email via Resend:", resendError);
      return NextResponse.json(
        { error: "Failed to send reset email." },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Unexpected error sending email:", err);
    return NextResponse.json(
      { error: "Failed to send reset email." },
      { status: 500 }
    );
  }

  // Thành công
  return NextResponse.json({
    message:
      "If the email exists, a reset link was sent.",
  });
}
