'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Resource = {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  required_points: number;
  is_active: boolean;
  created_at: string;
};

const INPUT =
  'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN_PRIMARY =
  'inline-flex items-center px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center px-4 py-2 rounded-lg font-semibold bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50';

export default function AdminRewardResourceManager() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requiredPoints, setRequiredPoints] = useState('20');
  const [file, setFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [resources, setResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // Lấy profile hiện tại & kiểm tra role admin/secretary
  useEffect(() => {
    async function init() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setMsg('Không xác định được người dùng hiện tại.');
        return;
      }
      const userId = data.user.id;
      setProfileId(userId);

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profErr || !prof) {
        setMsg('Không lấy được thông tin profile.');
        return;
      }

      // Cho phép admin + secretary
      if (prof.role === 'admin' || prof.role === 'secretary') {
        setIsAdmin(true);
        await loadResources();
      } else {
        setIsAdmin(false);
        setMsg('Bạn không có quyền quản lý tài nguyên thưởng.');
      }
    }

    init();
  }, []);

  async function loadResources() {
    setLoadingResources(true);
    const res = await fetch('/api/rewards/resources');
    if (!res.ok) {
      setMsg('Không tải được danh sách tài nguyên.');
      setLoadingResources(false);
      return;
    }
    const json = await res.json();
    setResources(json.resources || []);
    setLoadingResources(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');

    if (!isAdmin) {
      setMsg('Bạn không có quyền upload tài nguyên.');
      return;
    }
    if (!profileId) {
      setMsg('Không xác định được tài khoản hiện tại.');
      return;
    }
    if (!file) {
      setMsg('Vui lòng chọn file.');
      return;
    }
    if (!title.trim()) {
      setMsg('Vui lòng nhập tiêu đề tài nguyên.');
      return;
    }
    const rp = parseInt(requiredPoints, 10);
    if (Number.isNaN(rp) || rp < 0) {
      setMsg('required_points phải là số nguyên ≥ 0.');
      return;
    }

    setSaving(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('required_points', String(rp));
    formData.append('created_by', profileId);
    // project_id & round_id để trống hiện tại

    try {
      const res = await fetch('/api/rewards/resources', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || 'Upload thất bại.');
      } else {
        setMsg('✅ Đã tạo tài nguyên mới.');
        setTitle('');
        setDescription('');
        setRequiredPoints('20');
        setFile(null);
        await loadResources();
      }
    } catch (err) {
      console.error(err);
      setMsg('Lỗi mạng khi upload file.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-3">Tài nguyên thưởng</h1>
        <p className="text-sm text-red-600">{msg || 'Bạn không có quyền truy cập.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="border-b pb-3 mb-4">
        <h1 className="text-2xl font-bold">Quản lý tài nguyên thưởng</h1>
        <p className="text-sm text-gray-600">
          Upload file (PDF / Word / PowerPoint) và đặt số điểm tối thiểu để người tham gia có thể tải.
        </p>
      </header>

      <section className="bg-white border rounded-xl p-4 space-y-4">
        <h2 className="text-lg font-semibold mb-2">Tạo tài nguyên mới</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
            <input
              className={INPUT}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Slide GERD 2025"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Mô tả</label>
            <textarea
              className={INPUT}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn về tài nguyên…"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Điểm tối thiểu để tải (required_points) *
              </label>
              <input
                className={INPUT + ' w-32'}
                type="number"
                min={0}
                value={requiredPoints}
                onChange={(e) => setRequiredPoints(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Chọn file *</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Hỗ trợ: PDF, DOC/DOCX, PPT/PPTX. Tối đa 100MB.
              </p>
            </div>
          </div>

          {msg && <p className="text-sm text-red-600">{msg}</p>}

          <button type="submit" className={BTN_PRIMARY} disabled={saving}>
            {saving ? 'Đang upload…' : 'Lưu tài nguyên'}
          </button>
        </form>
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Danh sách tài nguyên hiện có</h2>
          <button onClick={loadResources} className={BTN_SECONDARY} disabled={loadingResources}>
            {loadingResources ? 'Đang tải…' : 'Làm mới'}
          </button>
        </div>

        {resources.length === 0 ? (
          <p className="text-sm text-gray-600">Chưa có tài nguyên nào.</p>
        ) : (
          <ul className="space-y-2">
            {resources.map((r) => (
              <li key={r.id} className="border rounded-lg p-3 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    {r.description && (
                      <p className="text-xs text-gray-600 mt-0.5">{r.description}</p>
                    )}
                  </div>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                    ≥ {r.required_points} điểm
                  </span>
                </div>
                <a
                  href={r.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline"
                >
                  Xem đường dẫn file
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
