import { FormEvent, useState } from 'react';

type ProfileFormValues = {
  name: string;
  email: string;
  phone: string;
  workplace: string;
  specialty: string;
};

type ProfileRole =
  | 'admin'
  | 'core_expert'
  | 'viewer'
  | 'secretary'
  | 'external_expert'
  | string;

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

  return (
    <section className="bg-white border rounded-xl p-4 space-y-4">
      <h2 className="text-lg font-semibold mb-1">Thông tin tài khoản</h2>
      <p className="text-xs text-gray-500 mb-2">
        Vui lòng cập nhật đầy đủ để Hội đồng có thể liên hệ và ghi nhận đóng góp
        của bạn.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 max-w-xl">
        <div>
          <label className="block text-sm font-medium mb-1">Họ và tên</label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Nguyễn Văn A"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Email đăng nhập
          </label>
          <input
            type="email"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="email@domain.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            Email này dùng để nhận link khảo sát và đăng nhập hệ thống. Nếu bạn
            đổi email, có thể cần xác minh lại.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Số điện thoại
          </label>
          <input
            type="tel"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="Ví dụ: 0903 xxx xxx"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Nơi công tác
          </label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.workplace}
            onChange={(e) => handleChange('workplace', e.target.value)}
            placeholder="Bệnh viện / Trường / Đơn vị công tác"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Chuyên ngành đang công tác
          </label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={form.specialty}
            onChange={(e) => handleChange('specialty', e.target.value)}
            placeholder="Ví dụ: Nội khoa, YHCT Cơ – Xương – Khớp..."
          />
        </div>

        {role && (
          <p className="text-xs text-gray-500">
            Vai trò trong hệ thống:{' '}
            <span className="font-medium">{role}</span>
          </p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex items-center px-4 py-2 text-sm rounded-md text-white ${
              saving
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? 'Đang lưu…' : 'Lưu thông tin'}
          </button>
        </div>
      </form>
    </section>
  );
}
