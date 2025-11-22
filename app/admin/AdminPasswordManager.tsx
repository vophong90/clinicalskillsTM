'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
};

const INPUT =
  'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN_PRIMARY =
  'inline-flex items-center px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center px-3 py-1.5 rounded-lg font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50';

export default function AdminPasswordManager() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>(''); // để dành, sau dùng filter role
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [msg, setMsg] = useState('');
  const [resetting, setResetting] = useState(false);

  // Kiểm tra quyền admin
  useEffect(() => {
    async function checkAdmin() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setMsg('Không xác định được người dùng hiện tại.');
        return;
      }
      const uid = data.user.id;
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .single();

      if (profErr || !prof) {
        setMsg('Không lấy được thông tin profile.');
        return;
      }

      if (prof.role === 'admin') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        setMsg('Bạn không có quyền quản lý mật khẩu.');
      }
    }

    checkAdmin();
  }, []);

  async function loadUsers() {
    setMsg('');
    setLoadingUsers(true);
    setSelectedIds(new Set());

    try {
      let q = supabase
        .from('profiles')
        .select('id, email, name, role')
        .order('created_at', { ascending: false })
        .limit(100);

      const search = query.trim();
      if (search) {
        // Tìm theo email hoặc name (ilike)
        q = q.or(
          `email.ilike.%${search}%,name.ilike.%${search}%`
        );
      }

      const { data, error } = await q;
      if (error) {
        console.error(error);
        setMsg('Lỗi khi tìm người dùng.');
      } else {
        setUsers(data || []);
        if (!search && (data || []).length === 0) {
          setMsg('Chưa có người dùng nào.');
        }
      }
    } catch (e) {
      console.error(e);
      setMsg('Lỗi không xác định khi tải danh sách người dùng.');
    } finally {
      setLoadingUsers(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map((u) => u.id)));
    }
  }

  async function handleResetPasswords() {
    setMsg('');
    if (selectedIds.size === 0) {
      setMsg('Vui lòng chọn ít nhất 1 người dùng.');
      return;
    }

    const confirm = window.confirm(
      `Bạn chắc chắn muốn reset mật khẩu về "12345678@" cho ${selectedIds.size} tài khoản?`
    );
    if (!confirm) return;

    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_ids: Array.from(selectedIds) }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(
          json.error || 'Reset mật khẩu thất bại. Vui lòng kiểm tra lại cấu hình.'
        );
      } else {
        setMsg(
          `✅ Đã reset mật khẩu cho ${json.success} tài khoản. Thất bại: ${json.failed}.`
        );
      }
    } catch (e) {
      console.error(e);
      setMsg('Lỗi mạng khi gọi API reset mật khẩu.');
    } finally {
      setResetting(false);
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-3">Quản lý mật khẩu</h1>
        <p className="text-sm text-red-600">
          {msg || 'Bạn không có quyền truy cập chức năng này.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="border-b pb-3 mb-2">
        <h1 className="text-2xl font-bold">Quản lý mật khẩu</h1>
        <p className="text-sm text-gray-600">
          Tìm người dùng theo tên hoặc email, chọn nhiều tài khoản và reset mật khẩu về mặc định
          <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs ml-1">12345678@</code>.
        </p>
      </header>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className={INPUT + ' max-w-xs'}
            placeholder="Tìm theo email hoặc họ tên…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                loadUsers();
              }
            }}
          />
          <button
            onClick={loadUsers}
            className={BTN_SECONDARY}
            disabled={loadingUsers}
          >
            {loadingUsers ? 'Đang tìm…' : '🔍 Tìm người dùng'}
          </button>

          {/* Để dành sau nếu muốn lọc theo role */}
          {/* <select
            className={INPUT + ' w-40 text-sm'}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Tất cả vai trò</option>
            <option value="admin">Admin</option>
            <option value="secretary">Thư ký</option>
            <option value="viewer">Viewer</option>
            <option value="core_expert">Chuyên gia nòng cốt</option>
            <option value="external_expert">Chuyên gia bên ngoài</option>
          </select> */}
        </div>

        {msg && <p className="text-sm text-red-600 mt-1">{msg}</p>}
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Kết quả tìm kiếm ({users.length} tài khoản)
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className={BTN_SECONDARY}
              disabled={users.length === 0}
            >
              {selectedIds.size === users.length
                ? 'Bỏ chọn tất cả'
                : 'Chọn tất cả'}
            </button>
            <button
              onClick={handleResetPasswords}
              className={BTN_PRIMARY}
              disabled={resetting || selectedIds.size === 0}
            >
              {resetting
                ? 'Đang reset…'
                : `Reset mật khẩu (${selectedIds.size})`}
            </button>
          </div>
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-gray-600">
            Chưa có dữ liệu. Hãy nhập từ khoá và bấm &quot;Tìm người dùng&quot;.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-2 py-1 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === users.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-2 py-1 text-left">Họ tên</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-left">Vai trò</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const checked = selectedIds.has(u.id);
                  return (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(u.id)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        {u.name || <span className="text-gray-400">(chưa có tên)</span>}
                      </td>
                      <td className="px-2 py-1">{u.email}</td>
                      <td className="px-2 py-1 text-xs">
                        <span className="inline-flex px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {u.role}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
