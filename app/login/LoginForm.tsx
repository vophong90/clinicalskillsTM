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

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-green-50 to-blue-100 relative">
      {/* CARD */}
      <div className="bg-white rounded-2xl shadow-2xl px-8 py-10 w-full max-w-md flex flex-col items-center gap-y-6">
        {/* Logo */}
        <img
          src="/logo.jpg"
          alt="Logo"
          className="w-24 h-24 rounded-full object-contain shadow-md border-4 border-green-100 bg-white mb-2"
        />

        {/* Title */}
        <h1 className="text-3xl font-extrabold text-green-700 text-center mb-1">
          Clinical Skills Delphi
        </h1>

        <div className="text-base text-gray-500 mb-2 text-center">
          Đăng nhập để tham gia khảo sát
        </div>

        {/* FORM */}
        <form
          onSubmit={handleLogin}
          className="w-full flex flex-col gap-y-6 mt-2"
        >
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Email</label>
            <input
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Nhập email của bạn"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Mật khẩu</label>
            <input
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
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
            className="bg-green-700 text-white py-3 rounded-lg font-bold hover:bg-green-800 transition disabled:opacity-60 w-full mt-2"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <div className="mt-2 text-center text-sm text-gray-500">
          Quên mật khẩu? <span className="underline">Liên hệ thư ký hội đồng</span>
        </div>

        {msg && (
          <div className={`mt-2 text-center text-base ${msg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
            {msg}
          </div>
        )}
      </div>
      {/* COPYRIGHT luôn sát cuối trang */}
      <footer className="w-full text-center text-xs text-gray-400 py-4 absolute bottom-0 left-0">
        © {new Date().getFullYear()} Đội ngũ Clinical Delphi
      </footer>
    </div>
  );
}
