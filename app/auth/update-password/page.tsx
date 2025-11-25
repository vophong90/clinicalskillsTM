import { Suspense } from "react";
import { UpdatePasswordClient } from "./UpdatePasswordClient";

export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-100">
          <div className="bg-white rounded-2xl shadow-xl p-6">
            Đang tải trang đặt lại mật khẩu…
          </div>
        </div>
      }
    >
      <UpdatePasswordClient />
    </Suspense>
  );
}
