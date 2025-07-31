'use client';

import { useState } from "react";
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setMsg("❌ " + error.message);
    else setMsg("✅ Đã gửi liên kết đăng nhập tới email của bạn. Hãy kiểm tra hộp thư!");
    setLoading(false);
  };

  return (
  <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-blue-100 to-indigo-200 px-2">
    {/* Card container */}
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md flex flex-col items-center">
      {/* Logo và tiêu đề */}
      <img
        src="/logo.jpg"
        alt="Logo"
        className="w-24 h-24 rounded-full shadow mb-4 object-cover border-4 border-blue-200"
        style={{ background: "#fff" }}
      />
      <h1 className="text-3xl font-extrabold text-blue-800 mb-1 tracking-tight text-center drop-shadow-sm">
        Clinical Skills Delphi
      </h1>
      <p className="text-base text-gray-600 mb-6 text-center">
        Đăng nhập để tham gia khảo sát
      </p>

      {/* Login Form */}
      <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
        <label className="font-semibold text-gray-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="border border-blue-200 rounded-lg px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Nhập email của bạn"
          required
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !email}
          className="mt-2 bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition disabled:opacity-60 text-lg shadow"
        >
          {loading ? "Đang gửi liên kết..." : "Gửi liên kết đăng nhập"}
        </button>
      </form>

      {/* Link hỗ trợ */}
      <div className="mt-5 text-center text-sm text-gray-500">
        Bạn chưa có tài khoản?{" "}
        <span className="text-blue-700 underline cursor-pointer hover:text-blue-900">
          Liên hệ thư ký hội đồng
        </span>
      </div>

      {/* Thông báo lỗi/thành công */}
      {msg && (
        <div
          className={`mt-5 text-center text-base font-medium ${
            msg.startsWith("✅") ? "text-green-600" : "text-red-600"
          }`}
        >
          {msg}
        </div>
      )}
    </div>

    {/* Footer */}
    <div className="mt-8 mb-2 text-gray-400 text-xs text-center">
      © {new Date().getFullYear()} Đội ngũ Clinical Delphi
    </div>
  </div>
);
}
