"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg("❌ " + error.message);
    } else {
      setMsg("✅ Đăng nhập thành công! Đang chuyển...");
      setTimeout(() => router.push("/dashboard"), 700);
    }
    setLoading(false);
  }

  // ✅ Dùng API mới /api/auth/request-reset (Resend), KHÔNG gọi Supabase resetPasswordForEmail nữa
  async function handleSendResetLink() {
    setMsg("");
    if (!email) {
      setMsg("❌ Vui lòng nhập email trước khi yêu cầu đặt lại mật khẩu.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Không tiết lộ email có tồn tại hay không – message luôn giống nhau
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data?.error) {
        // Nếu backend trả error rõ ràng thì vẫn hiện ra cho bạn debug
        setMsg("❌ " + data.error);
      } else {
        setMsg("✅ Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.");
      }
    } catch (err) {
      console.error(err);
      setMsg("❌ Có lỗi kết nối, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-blue-100 relative">
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="bg-white rounded-2xl shadow-xl px-8 py-10 w-full max-w-md flex flex-col items-center space-y-6">
          {/* Logo */}
          <img
            src="/logo.jpg"
            alt="Logo"
            className="w-20 h-20 object-contain rounded-full border-4 border-green-200 shadow mb-2"
            style={{ maxWidth: 80, maxHeight: 80 }}
          />
          {/* Title */}
          <h1 className="text-2xl font-extrabold text-green-700 text-center">
            Clinical Skills Delphi
          </h1>
          <div className="text-base text-gray-500 text-center">
            Đăng nhập để tham gia khảo sát
          </div>

          {/* FORM */}
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-y-5 mt-2">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Email</label>
              <input
                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập email của bạn"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Mật khẩu</label>
              <input
                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="bg-green-700 text-white py-2 rounded-lg font-bold hover:bg-green-800 transition disabled:opacity-60 w-full"
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>

            <button
              type="button"
              onClick={handleSendResetLink}
              disabled={loading || !email}
              className="text-sm text-green-700 underline mt-1 disabled:opacity-60"
            >
              Gửi liên kết đặt lại mật khẩu
            </button>
          </form>

          <div className="text-center text-sm text-gray-500 pt-2">
            Quên mật khẩu? <span className="underline">Nhập email và bấm &quot;Gửi liên kết đặt lại mật khẩu&quot;</span>
          </div>

          {msg && (
            <div
              className={`text-center text-base ${
                msg.startsWith("✅") ? "text-green-600" : "text-red-600"
              } pt-2`}
            >
              {msg}
            </div>
          )}
        </div>
      </div>
      <footer className="w-full text-center text-xs text-gray-400 py-3 absolute bottom-0 left-0">
        © {new Date().getFullYear()} Đội ngũ Clinical Delphi
      </footer>
    </div>
  );
}
