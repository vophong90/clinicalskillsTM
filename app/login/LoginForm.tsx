"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg("❌ " + error.message);
    else setMsg("✅ Đăng nhập thành công! Đang chuyển trang...");
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-gradient-to-br from-blue-50 to-green-100">
      {/* Main Centered Content */}
      <div className="flex flex-1 flex-col justify-center items-center">
        <div className="w-full max-w-md bg-white shadow-2xl rounded-2xl px-8 py-10 flex flex-col items-center animate-fade-in">
          {/* Logo */}
          <img
            src="/logo.jpg"
            alt="Logo"
            className="w-20 h-20 rounded-full shadow mb-6 border-4 border-green-200 object-contain"
            style={{ background: "white" }}
          />
          {/* Title */}
          <h1 className="text-3xl font-extrabold text-green-700 mb-2 text-center tracking-tight">Clinical Skills Delphi</h1>
          <div className="text-base text-gray-600 mb-6 text-center">Đăng nhập để tham gia khảo sát</div>
          {/* Login Form */}
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Email</label>
              <input
                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
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
                onChange={e => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="bg-green-700 text-white py-2 rounded-lg font-bold hover:bg-green-800 transition disabled:opacity-60 w-full mt-2"
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
          <div className="mt-5 text-center text-sm text-gray-500">
            Quên mật khẩu? <span className="underline">Liên hệ thư ký hội đồng</span>
          </div>
          {msg && (
            <div className={`mt-4 text-center text-base ${msg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
              {msg}
            </div>
          )}
        </div>
      </div>
      {/* Copyright */}
      <footer className="w-full text-center text-xs text-gray-400 py-4">
        © {new Date().getFullYear()} Đội ngũ Clinical Delphi
      </footer>
      <style>{`
        .animate-fade-in {
          animation: fade-in .7s cubic-bezier(0.4,0,0.2,1);
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(40px);}
          to { opacity: 1; transform: none;}
        }
      `}</style>
    </div>
  );
}
