"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ChangePasswordForm() {
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (newPwd.length < 8) return setMsg("❌ Mật khẩu mới phải ≥ 8 ký tự.");
    if (newPwd !== newPwd2) return setMsg("❌ Nhập lại mật khẩu mới chưa khớp.");

    setLoading(true);

    // (Tuỳ chọn) Xác thực lại để đảm bảo người dùng thật sự biết mật khẩu cũ
    if (currentEmail && currentPwd) {
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: currentPwd,
      });
      if (reAuthErr) {
        setMsg("❌ Mật khẩu hiện tại không đúng.");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) setMsg("❌ " + error.message);
    else setMsg("✅ Đã đổi mật khẩu.");
    setLoading(false);
  }

  return (
    <form onSubmit={handleChange} className="space-y-4 max-w-md">
      {/* Nếu muốn bắt người dùng nhập lại mật khẩu hiện tại, hiển thị 2 ô dưới: */}
      <input
        type="email"
        placeholder="Email hiện tại (tuỳ chọn để xác thực lại)"
        value={currentEmail}
        onChange={e => setCurrentEmail(e.target.value)}
        className="w-full border rounded-lg px-4 py-2"
      />
      <input
        type="password"
        placeholder="Mật khẩu hiện tại (tuỳ chọn để xác thực lại)"
        value={currentPwd}
        onChange={e => setCurrentPwd(e.target.value)}
        className="w-full border rounded-lg px-4 py-2"
      />

      <input
        type="password"
        placeholder="Mật khẩu mới"
        value={newPwd}
        onChange={e => setNewPwd(e.target.value)}
        className="w-full border rounded-lg px-4 py-2"
        required
      />
      <input
        type="password"
        placeholder="Nhập lại mật khẩu mới"
        value={newPwd2}
        onChange={e => setNewPwd2(e.target.value)}
        className="w-full border rounded-lg px-4 py-2"
        required
      />
      <button
        type="submit"
        disabled={loading || !newPwd || !newPwd2}
        className="bg-green-700 text-white py-2 rounded-lg font-bold hover:bg-green-800 transition disabled:opacity-60"
      >
        {loading ? "Đang đổi..." : "Đổi mật khẩu"}
      </button>
      {msg && <div className={`text-sm ${msg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{msg}</div>}
    </form>
  );
}
