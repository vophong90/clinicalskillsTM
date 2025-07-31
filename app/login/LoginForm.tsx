'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setMsg('❌ ' + error.message);
    else setMsg('✅ Đăng nhập thành công! Đang chuyển trang...');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-blue-100 to-indigo-200 px-2">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md flex flex-col items-center">
        {/* Logo nhỏ gọn trong card */}
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
          <label className="font-semibold text-gray-700" htmlFor="password">
            Mật khẩu
          </label>
          <input
            id="password"
            className="border border-blue-200 rounded-lg px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Nhập mật khẩu"
            required
          />
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="mt-2 bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition disabled:opacity-60 text-lg shadow"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
        <div className="mt-5 text-center text-sm text-gray-500">
          Quên mật khẩu? <span className="text-blue-700 underline cursor-pointer hover:text-blue-900">Liên hệ thư ký hội đồng</span>
        </div>
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
      <div className="mt-8 mb-2 text-gray-400 text-xs text-center">
        © {new Date().getFullYear()} Đội ngũ Clinical Delphi
      </div>
    </div>
  );
}
