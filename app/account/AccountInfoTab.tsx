'use client';

import { useState, FormEvent } from 'react';

type ProfileRole =
  | 'admin'
  | 'core_expert'
  | 'viewer'
  | 'secretary'
  | 'external_expert'
  | string;

export type ProfileFormValues = {
  name: string;
  email: string;
  phone: string;
  workplace: string;
  specialty: string;
};

type Props = {
  initialValues: ProfileFormValues;
  role: ProfileRole | null;
  saving: boolean;
  onSave: (values: ProfileFormValues) => Promise<void> | void;
};

export default function AccountInfoTab({
  initialValues,
  role,
  saving,
  onSave,
}: Props) {
  const [form, setForm] = useState<ProfileFormValues>(initialValues);

  function handleChange<K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSave(form);
  }

  const roleLabel = (() => {
    switch (role) {
      case 'admin':
        return 'Quản trị viên';
      case 'secretary':
        return 'Thư ký hội đồng';
      case 'viewer':
        return 'Quan sát viên';
      case 'core_expert':
        return 'Chuyên gia nòng cốt';
      case 'external_expert':
        return 'Chuyên gia bên ngoài';
      default:
        return role || 'Chưa xác định';
    }
  })();

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
    >
      {/* Thông tin vai trò */}
      <div className="rounded-lg border bg-blue-50 border-blue-100 p-3 text-xs text-gray-700">
        <p>
          <span className="font-semibold">Vai trò: </span>
          {roleLabel}
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          Vai trò do quản trị viên gán, quyết định quyền truy cập project, vòng
          khảo sát và các tính năng nội bộ.
        </p>
      </div>

      {/* Họ tên + email */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Họ tên
          </label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Nhập họ tên đầy đủ…"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Email đăng nhập
          </label>
          <input
            type="email"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="vd: ten@coquan.vn"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Thay đổi trường này sẽ cập nhật luôn email đăng nhập của bạn.
          </p>
        </div>
      </div>

      {/* Điện thoại + nơi công tác */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Số điện thoại
          </label>
          <input
            type="tel"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="vd: 09xx xxx xxx"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Nơi công tác
          </label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.workplace}
            onChange={(e) => handleChange('workplace', e.target.value)}
            placeholder="vd: BV YHCT TP.HCM, Bộ môn YHCT…"
          />
        </div>
      </div>

      {/* Chuyên ngành */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Chuyên ngành / lĩnh vực công tác
        </label>
        <input
          type="text"
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={form.specialty}
          onChange={(e) => handleChange('specialty', e.target.value)}
          placeholder="vd: Y học cổ truyền, Nội khoa, Chấn thương chỉnh hình…"
        />
      </div>

      {/* Nút lưu */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] text-gray-500">
          Thông tin này chỉ được sử dụng để liên lạc và thống kê nội bộ.
        </p>
        <button
          type="submit"
          disabled={saving}
          className={`px-4 py-2 rounded-md text-sm text-white ${
            saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}
