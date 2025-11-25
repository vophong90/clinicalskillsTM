"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Ngăn Next cố prerender static trang này
export const dynamic = "force-dynamic";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // useSearchParams có thể là null trong lúc prerender → phải check trước
  const token = searchParams ? searchParams.get("token") : null;

  useEffect(() => {
    if (!token) {
      setTokenMissing(true);
      setMsg("❌ Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
    }
  }, [token]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (!token) {
      setMsg("❌ Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      setTokenMissing(true);
      return;
    }
    if (password.length < 8) {
      setMsg("❌ Mật khẩu phải ≥ 8 ký tự.");
      return;
    }
    if (password !== pwd2) {
      setMsg("❌ Nhập lại mật khẩu chưa khớp.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg("❌ " + (data?.error || "Đặt lại mật khẩu thất bại."));
      } else {
        setMsg("✅ Đổi mật khẩu thành công. Đang chuyển tới trang đăng nhập…");
        setTimeout(() => router.push("/login"), 1000);
      }
    } catch (err) {
      console.error(err);
      setMsg("❌ Có lỗi kết nối, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-100">
      <form
        onSubmit={handleUpdate}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-4"
      >
        <h1 className="text-xl font-bold text-green-700">Đặt mật khẩu mới</h1>

        {tokenMissing && (
          <div className="text-red-600 text-sm">
            Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu
            cầu gửi lại email đặt mật khẩu.
          </div>
        )}

        <input
          type="password"
          className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
          placeholder="Mật khẩu mới"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={tokenMissing}
        />
        <input
          type="password"
          className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
          placeholder="Nhập lại mật khẩu mới"
          value={pwd2}
          onChange={(e) => setPwd2(e.target.value)}
          required
          disabled={tokenMissing}
        />
        <button
          type="submit"
          disabled={loading || !password || !pwd2 || tokenMissing}
          className="bg-green-700 text-white py-2 rounded-lg font-bold hover:bg-green-800 transition disabled:opacity-60 w-full"
        >
          {loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        </button>

        {msg && (
          <div
            className={`text-center mt-2 ${
              msg.startsWith("✅") ? "text-green-600" : "text-red-600"
            }`}
          >
            {msg}
          </div>
        )}
      </form>
    </div>
  );
}
