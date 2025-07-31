'use client';

import { useState } from "react";
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  // Có thể đổi qua signInWithPassword nếu bạn dùng password
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          {/* Đổi src sang logo của bạn */}
          <img src="/logo.svg" alt="Logo" className="w-16 h-16 mb-2" />
          <h1 className="text-2xl font-bold text-blue-800 mb-1">Clinical Skills Delphi</h1>
          <span className="text-sm text-gray-500 mb-2">Đăng nhập để tham gia khảo sát</span>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <label className="font-semibold text-gray-700">Email:</label>
          <input
            className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
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
            className="bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition disabled:opacity-60"
          >
            {loading ? "Đang gửi liên kết..." : "Gửi liên kết đăng nhập"}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-600">
          Bạn chưa có tài khoản? <span className="underline">Liên hệ thư ký hội đồng</span>
        </div>
        {msg && (
          <div className={`mt-4 text-center text-base ${msg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
            {msg}
          </div>
        )}
      </div>
      <div className="mt-8 text-gray-500 text-xs">© {new Date().getFullYear()} Đội ngũ Clinical Delphi</div>
    </div>
  );
}
