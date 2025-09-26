"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (password.length < 8) {
      setMsg("❌ Mật khẩu phải ≥ 8 ký tự.");
      return;
    }
    if (password !== pwd2) {
      setMsg("❌ Nhập lại mật khẩu chưa khớp.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMsg("❌ " + error.message);
    else {
      setMsg("✅ Đổi mật khẩu thành công. Đang chuyển…");
      setTimeout(() => router.push("/dashboard"), 800);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-100">
      <form onSubmit={handleUpdate} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold text-green-700">Đặt mật khẩu mới</h1>
        <input
          type="password"
          className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
          placeholder="Mật khẩu mới"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
          placeholder="Nhập lại mật khẩu mới"
          value={pwd2}
          onChange={e => setPwd2(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading || !password || !pwd2}
          className="bg-green-700 text-white py-2 rounded-lg font-bold hover:bg-green-800 transition disabled:opacity-60 w-full"
        >
          {loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        </button>
        {msg && <div className={`text-center ${msg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{msg}</div>}
      </form>
    </div>
  );
}
