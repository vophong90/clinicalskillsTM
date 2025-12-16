'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type UserProfile = { id: string; email: string; name: string; role: string };
type Project = { id: string; title: string };
type Permission = { id: string; user_id: string; project_id: string; role: string };

function translateRole(role: string) {
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
      return role;
  }
}

const SYSTEM_ROLES = [
  { value: 'admin', label: 'Quản trị viên' },
  { value: 'secretary', label: 'Thư ký hội đồng' },
  { value: 'viewer', label: 'Quan sát viên' },
  { value: 'core_expert', label: 'Chuyên gia nòng cốt' },
  { value: 'external_expert', label: 'Chuyên gia bên ngoài' },
];

const INPUT =
  'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN_PRIMARY =
  'inline-flex items-center px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center px-3 py-1.5 rounded-lg font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50';

export default function AdminUserManager() {
  const router = useRouter();

  // ====== DATA STATE ======
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // ====== AUTH / PERMISSION ======
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // ====== UI STATE ======
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');

  // ====== COMBOBOX STATE ======
  const [filterSystemRole, setFilterSystemRole] = useState<string>('');
  const [comboOpen, setComboOpen] = useState(false);
  const [comboQuery, setComboQuery] = useState('');
  const comboWrapRef = useRef<HTMLDivElement | null>(null);

  // ====== RESET PASSWORD STATE ======
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [resetting, setResetting] = useState(false);

  // ====== LOAD + CHECK ADMIN ======
  async function checkAdmin() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setIsAdmin(false);
      setMessage('Không xác định được người dùng hiện tại.');
      return;
    }

    const uid = data.user.id;
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .single();

    if (profErr || !prof) {
      setIsAdmin(false);
      setMessage('Không lấy được thông tin profile.');
      return;
    }

    if (prof.role === 'admin') {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
      setMessage('Bạn không có quyền quản lý người dùng / mật khẩu.');
    }
  }

  async function loadAll() {
    setLoading(true);
    setMessage('');

    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) throw new Error('Not authenticated');

    const [
      { data: profiles, error: profErr },
      { data: projectsData, error: projErr },
      { data: permissionsData, error: permErr },
    ] = await Promise.all([
      supabase.from('profiles').select('id, email, name, role').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, title'),
      supabase.from('permissions').select('id, user_id, project_id, role'),
    ]);

    if (profErr) throw profErr;
    if (projErr) throw projErr;
    if (permErr) throw permErr;

    setUsers((profiles as UserProfile[]) ?? []);
    setProjects((projectsData as Project[]) ?? []);
    setPermissions((permissionsData as Permission[]) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await checkAdmin();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          router.push('/login');
          return;
        }
        if (!cancelled) await loadAll();
      } catch {
        router.push('/login');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ====== OUTSIDE CLICK CLOSE COMBOBOX ======
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!comboWrapRef.current) return;
      if (!comboWrapRef.current.contains(e.target as Node)) setComboOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ====== FILTERED USERS FOR COMBOBOX ======
  const filteredUsers = useMemo(() => {
    const q = comboQuery.trim().toLowerCase();
    return users
      .filter((u) => (filterSystemRole ? u.role === filterSystemRole : true))
      .filter((u) => {
        if (!q) return true;
        const email = (u.email || '').toLowerCase();
        const name = (u.name || '').toLowerCase();
        return email.includes(q) || name.includes(q);
      })
      .slice(0, 50); // tránh list quá dài
  }, [users, comboQuery, filterSystemRole]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  // Khi chọn user -> set input hiển thị và đóng list
  function selectUser(u: UserProfile) {
    setSelectedUserId(u.id);
    setComboQuery(`${u.name || u.email} (${u.email})`);
    setComboOpen(false);
  }

  // Nếu đổi filter / query làm mất selectedUser thì reset selection
  useEffect(() => {
    if (!selectedUserId) return;
    const stillExists = users.some((u) => u.id === selectedUserId);
    if (!stillExists) setSelectedUserId(null);
  }, [users, selectedUserId]);

  // ====== HELPERS: PROJECT PERMISSIONS ======
  const userProjects = useMemo(() => {
    if (!selectedUserId) return [];
    return permissions
      .filter((p) => p.user_id === selectedUserId)
      .map((p) => ({
        permission_id: p.id,
        project_id: p.project_id,
        title: projects.find((pr) => pr.id === p.project_id)?.title || '',
        role: p.role,
      }));
  }, [permissions, projects, selectedUserId]);

  const availableProjects = useMemo(
    () => projects.filter((pr) => !userProjects.some((up) => up.project_id === pr.id)),
    [projects, userProjects]
  );

  // ====== ACTIONS: SYSTEM ROLE ======
  async function changeUserRole(newRole: string) {
    if (!selectedUserId) return;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', selectedUserId);
    setMessage(error ? '❌ Lỗi cập nhật quyền hệ thống: ' + error.message : '✅ Đã cập nhật quyền hệ thống!');
    await loadAll();
  }

  // ====== ACTIONS: PROJECT PERMISSIONS ======
  async function addUserToProject(projectId: string, projectRole: string = 'viewer') {
    if (!selectedUserId) return;
    const { error } = await supabase.from('permissions').insert([
      { id: crypto.randomUUID(), user_id: selectedUserId, project_id: projectId, role: projectRole },
    ]);
    setMessage(error ? '❌ Lỗi thêm vào project: ' + error.message : '✅ Đã thêm user vào project!');
    await loadAll();
  }

  async function removeUserFromProject(permissionId: string) {
    const { error } = await supabase.from('permissions').delete().eq('id', permissionId);
    setMessage(error ? '❌ Lỗi xóa quyền project: ' + error.message : '🗑️ Đã xóa quyền project!');
    await loadAll();
  }

  async function changeProjectRole(permissionId: string, newRole: string) {
    const { error } = await supabase.from('permissions').update({ role: newRole }).eq('id', permissionId);
    setMessage(error ? '❌ Lỗi cập nhật quyền project: ' + error.message : '✅ Đã cập nhật quyền project!');
    await loadAll();
  }

  // ====== RESET PASSWORD (multi-select) ======
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(list: UserProfile[]) {
    setSelectedIds((prev) => {
      const allIds = list.map((u) => u.id);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  }

  async function handleResetPasswords() {
    setMessage('');

    if (selectedIds.size === 0) {
      setMessage('Vui lòng chọn ít nhất 1 người dùng.');
      return;
    }

    const ok = window.confirm(
      `Bạn chắc chắn muốn reset mật khẩu về "12345678@" cho ${selectedIds.size} tài khoản?`
    );
    if (!ok) return;

    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_ids: Array.from(selectedIds) }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || 'Reset mật khẩu thất bại. Vui lòng kiểm tra lại cấu hình.');
      } else {
        setMessage(`✅ Đã reset mật khẩu cho ${json.success} tài khoản. Thất bại: ${json.failed}.`);
        setSelectedIds(new Set()); // reset chọn
      }
    } catch (e) {
      console.error(e);
      setMessage('Lỗi mạng khi gọi API reset mật khẩu.');
    } finally {
      setResetting(false);
    }
  }

  // ====== UI: danh sách hiển thị trong bảng reset ======
  // Ưu tiên: nếu đang chọn roleFilter hoặc đang gõ query -> hiển thị theo filteredUsers;
  // nếu không -> hiển thị 100 user mới nhất (đỡ quá dài)
  const resetList = useMemo(() => {
    const hasFilter = !!filterSystemRole || !!comboQuery.trim();
    if (hasFilter) return filteredUsers;
    return users.slice(0, 100);
  }, [users, filteredUsers, filterSystemRole, comboQuery]);

  // ====== GUARD ======
  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold mb-3">Quản lý người dùng</h1>
        <p className="text-sm text-red-600">{message || 'Bạn không có quyền truy cập chức năng này.'}</p>
      </div>
    );
  }

  // ====== RENDER ======
  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
      <section>
        <header className="border-b pb-3 mb-6">
          <h2 className="text-3xl font-extrabold text-indigo-800">Quản lý người dùng</h2>
          <p className="text-sm text-gray-600 mt-1">
            Chọn user bằng combobox (gõ để lọc), phân quyền dự án, và reset mật khẩu về{' '}
            <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">12345678@</code>.
          </p>
        </header>

        {message && (
          <div className="mb-6 text-center py-2 rounded bg-green-50 text-green-700 shadow">
            {message}
          </div>
        )}

        {/* ========== COMBOBOX + FILTER ROLE ========== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start mb-8">
          <div className="md:col-span-2" ref={comboWrapRef}>
            <label className="block font-semibold mb-2 text-gray-700">Chọn người dùng (Combobox):</label>

            <div className="relative">
              <input
                className={INPUT}
                placeholder="Gõ email hoặc họ tên để lọc…"
                value={comboQuery}
                onChange={(e) => {
                  setComboQuery(e.target.value);
                  setComboOpen(true);
                }}
                onFocus={() => setComboOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setComboOpen(false);
                }}
              />

              {comboOpen && (
                <div className="absolute z-20 mt-2 w-full bg-white border rounded-xl shadow-lg max-h-72 overflow-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả phù hợp.</div>
                  ) : (
                    <ul className="py-1">
                      {filteredUsers.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-3"
                            onClick={() => selectUser(u)}
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate">
                                {u.name || '(chưa có tên)'}
                              </div>
                              <div className="text-xs text-gray-600 truncate">{u.email}</div>
                            </div>
                            <span className="text-xs inline-flex px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                              {translateRole(u.role)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                className={BTN_SECONDARY}
                onClick={() => {
                  setSelectedUserId(null);
                  setComboQuery('');
                  setComboOpen(false);
                }}
              >
                Xóa chọn
              </button>

              <div className="text-xs text-gray-500">
                {filterSystemRole || comboQuery.trim()
                  ? `Đang lọc: ${filteredUsers.length} kết quả`
                  : `Tổng user: ${users.length}`}
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-2 text-gray-700">Lọc theo quyền hệ thống:</label>
            <select
              className={INPUT}
              value={filterSystemRole}
              onChange={(e) => {
                setFilterSystemRole(e.target.value);
                setComboOpen(true);
              }}
            >
              <option value="">— Tất cả quyền —</option>
              {SYSTEM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ========== USER CARD ========== */}
        {selectedUser && (
          <div className="w-full border rounded-2xl p-6 bg-white shadow-xl space-y-6">
            <div>
              <div className="mb-1 text-gray-700">
                <b className="mr-2">Email:</b>
                <span className="font-mono text-indigo-800">{selectedUser.email}</span>
              </div>
              <div className="mb-1 text-gray-700">
                <b className="mr-2">Tên:</b>
                <span>{selectedUser.name}</span>
              </div>
              <div className="flex items-center mt-2">
                <b>Quyền hệ thống:</b>
                <select
                  className="ml-2 border border-gray-300 rounded px-2 py-1 bg-gray-50 text-indigo-800"
                  value={selectedUser.role}
                  onChange={(e) => changeUserRole(e.target.value)}
                >
                  {SYSTEM_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Phân quyền dự án */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <b className="text-gray-800">Phân quyền dự án:</b>
                <select
                  className="border rounded px-2 py-1 bg-gray-100 text-gray-800 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    const pid = e.target.value;
                    if (pid) addUserToProject(pid);
                    e.target.selectedIndex = 0;
                  }}
                >
                  <option value="">+ Thêm vào Project</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="mt-2 space-y-1">
                {userProjects.length === 0 && (
                  <li className="text-gray-400 italic">Chưa thuộc project nào.</li>
                )}

                {userProjects.map((p) => (
                  <li
                    key={p.permission_id}
                    className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2 bg-gray-50 rounded px-3 py-2"
                  >
                    <span>
                      <b>{p.title}</b>
                    </span>

                    <span className="flex items-center gap-2">
                      <select
                        className="border rounded px-2 py-1 bg-indigo-50 text-indigo-800 text-xs font-semibold"
                        value={p.role}
                        onChange={(e) => changeProjectRole(p.permission_id, e.target.value)}
                      >
                        {SYSTEM_ROLES.filter((r) => r.value !== 'admin').map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>

                      <span className="inline-block px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-semibold">
                        {translateRole(p.role)}
                      </span>

                      <button
                        className="text-red-500 text-xs font-bold hover:underline hover:text-red-700 ml-2"
                        onClick={() => removeUserFromProject(p.permission_id)}
                      >
                        Xóa
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ✅ Đã bỏ "Tham gia round" theo yêu cầu trước */}
          </div>
        )}

        {loading && <div className="text-gray-500 mt-6">Đang tải dữ liệu...</div>}
      </section>

      {/* ===================== RESET PASSWORD SECTION ===================== */}
      <section className="space-y-4">
        <header className="border-b pb-3">
          <h3 className="text-2xl font-bold">Quản lý mật khẩu</h3>
          <p className="text-sm text-gray-600 mt-1">
            Chọn nhiều tài khoản và reset mật khẩu về mặc định{' '}
            <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">12345678@</code>.
            Danh sách bên dưới sẽ bám theo bộ lọc (quyền hệ thống + từ khóa combobox).
          </p>
        </header>

        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h4 className="text-lg font-semibold">
              Danh sách ({resetList.length} tài khoản)
            </h4>

            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleSelectAll(resetList)}
                className={BTN_SECONDARY}
                disabled={resetList.length === 0}
              >
                {resetList.length > 0 && resetList.every((u) => selectedIds.has(u.id))
                  ? 'Bỏ chọn tất cả'
                  : 'Chọn tất cả'}
              </button>

              <button
                onClick={handleResetPasswords}
                className={BTN_PRIMARY}
                disabled={resetting || selectedIds.size === 0}
              >
                {resetting ? 'Đang reset…' : `Reset mật khẩu (${selectedIds.size})`}
              </button>
            </div>
          </div>

          {resetList.length === 0 ? (
            <p className="text-sm text-gray-600">Không có dữ liệu theo bộ lọc hiện tại.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-2 py-1 text-left w-10">
                      <input
                        type="checkbox"
                        checked={resetList.length > 0 && resetList.every((u) => selectedIds.has(u.id))}
                        onChange={() => toggleSelectAll(resetList)}
                      />
                    </th>
                    <th className="px-2 py-1 text-left">Họ tên</th>
                    <th className="px-2 py-1 text-left">Email</th>
                    <th className="px-2 py-1 text-left">Vai trò</th>
                  </tr>
                </thead>

                <tbody>
                  {resetList.map((u) => {
                    const checked = selectedIds.has(u.id);
                    return (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="px-2 py-1">
                          <input type="checkbox" checked={checked} onChange={() => toggleSelect(u.id)} />
                        </td>
                        <td className="px-2 py-1">
                          {u.name || <span className="text-gray-400">(chưa có tên)</span>}
                        </td>
                        <td className="px-2 py-1">{u.email}</td>
                        <td className="px-2 py-1 text-xs">
                          <span className="inline-flex px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                            {translateRole(u.role)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
