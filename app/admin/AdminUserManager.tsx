'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type UserProfile = { id: string; email: string | null; name: string | null; role: string };
type Project = { id: string; title: string };
type Permission = { id: string; user_id: string; project_id: string; role: string };

function translateRole(role: string) {
  switch (role) {
    case 'admin': return 'Quản trị viên';
    case 'secretary': return 'Thư ký hội đồng';
    case 'viewer': return 'Quan sát viên';
    case 'core_expert': return 'Chuyên gia nòng cốt';
    case 'external_expert': return 'Chuyên gia bên ngoài';
    default: return role;
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

const PAGE_SIZE = 50;

function useDebounce<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminUserManager() {
  const router = useRouter();

  // ====== AUTH / ADMIN ======
  const [isAdmin, setIsAdmin] = useState(false);

  // ====== BASE DATA ======
  const [projects, setProjects] = useState<Project[]>([]);

  // ====== SELECTED USER (fetch theo id, không phụ thuộc list 1000 dòng) ======
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userPermissions, setUserPermissions] = useState<Permission[]>([]);

  // ====== COMBOBOX SEARCH (server-side) ======
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [comboQuery, setComboQuery] = useState('');
  const debouncedComboQuery = useDebounce(comboQuery, 250);

  const [comboOpen, setComboOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement | null>(null);

  const [comboPage, setComboPage] = useState(1);
  const [comboTotal, setComboTotal] = useState(0);
  const [comboRows, setComboRows] = useState<UserProfile[]>([]);
  const [comboLoading, setComboLoading] = useState(false);

  // ====== RESET PASSWORD LIST (server-side + paginate) ======
  const [pwPage, setPwPage] = useState(1);
  const [pwTotal, setPwTotal] = useState(0);
  const [pwRows, setPwRows] = useState<UserProfile[]>([]);
  const [pwLoading, setPwLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [resetting, setResetting] = useState(false);

  // ====== UI MSG ======
  const [message, setMessage] = useState('');

  // ====== helpers ======
  function buildProfileQuery(base: ReturnType<typeof supabase.from>, q: string, role: string) {
    let query = base
      .select('id, email, name, role', { count: 'exact' })
      .order('created_at', { ascending: false });

    const s = q.trim();
    if (s) {
      // NOTE: dấu phẩy trong .or là OR
      query = query.or(`email.ilike.%${s}%,name.ilike.%${s}%`);
    }
    if (role) {
      query = query.eq('role', role);
    }
    return query;
  }

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
      setMessage('Bạn không có quyền truy cập chức năng này.');
    }
  }

  async function loadProjects() {
    const { data, error } = await supabase.from('projects').select('id, title').order('created_at', { ascending: false });
    if (error) throw error;
    setProjects((data as Project[]) ?? []);
  }

  // ====== SEARCH: Combobox results ======
  async function loadComboPage(page: number) {
    setComboLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const q = buildProfileQuery(supabase.from('profiles'), debouncedComboQuery, roleFilter)
        .range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;

      setComboRows((data as UserProfile[]) ?? []);
      setComboTotal(count ?? 0);
      setComboPage(page);
    } catch (e: any) {
      setComboRows([]);
      setComboTotal(0);
      setMessage('❌ Lỗi tải danh sách user: ' + (e?.message ?? String(e)));
    } finally {
      setComboLoading(false);
    }
  }

  // ====== SEARCH: Reset password table results ======
  async function loadPwPage(page: number) {
    setPwLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const q = buildProfileQuery(supabase.from('profiles'), debouncedComboQuery, roleFilter)
        .range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;

      setPwRows((data as UserProfile[]) ?? []);
      setPwTotal(count ?? 0);
      setPwPage(page);

      // khi đổi trang/filter/search thì clear selection (tránh reset nhầm)
      setSelectedIds(new Set());
    } catch (e: any) {
      setPwRows([]);
      setPwTotal(0);
      setMessage('❌ Lỗi tải danh sách reset password: ' + (e?.message ?? String(e)));
    } finally {
      setPwLoading(false);
    }
  }

  // ====== Selected user detail + permissions ======
  async function loadSelectedUser(userId: string) {
    setSelectedUser(null);
    setUserPermissions([]);

    if (!userId) return;

    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', userId)
      .single();

    if (profErr) {
      setMessage('❌ Không tải được profile user: ' + profErr.message);
      return;
    }
    setSelectedUser(prof as UserProfile);

    const { data: perms, error: permErr } = await supabase
      .from('permissions')
      .select('id, user_id, project_id, role')
      .eq('user_id', userId);

    if (permErr) {
      setMessage('❌ Không tải được permissions: ' + permErr.message);
      return;
    }
    setUserPermissions((perms as Permission[]) ?? []);
  }

  // ====== ACTIONS ======
  async function changeUserRole(newRole: string) {
    if (!selectedUserId) return;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', selectedUserId);
    if (error) {
      setMessage('❌ Lỗi cập nhật quyền hệ thống: ' + error.message);
      return;
    }
    setMessage('✅ Đã cập nhật quyền hệ thống!');
    await loadSelectedUser(selectedUserId);
    // refresh search lists
    await loadComboPage(comboPage);
    await loadPwPage(pwPage);
  }

  async function addUserToProject(projectId: string, projectRole: string = 'viewer') {
    if (!selectedUserId) return;
    const { error } = await supabase.from('permissions').insert([
      { id: crypto.randomUUID(), user_id: selectedUserId, project_id: projectId, role: projectRole },
    ]);
    setMessage(error ? '❌ Lỗi thêm vào project: ' + error.message : '✅ Đã thêm user vào project!');
    await loadSelectedUser(selectedUserId);
  }

  async function removeUserFromProject(permissionId: string) {
    const { error } = await supabase.from('permissions').delete().eq('id', permissionId);
    setMessage(error ? '❌ Lỗi xóa quyền project: ' + error.message : '🗑️ Đã xóa quyền project!');
    await loadSelectedUser(selectedUserId);
  }

  async function changeProjectRole(permissionId: string, newRole: string) {
    const { error } = await supabase.from('permissions').update({ role: newRole }).eq('id', permissionId);
    setMessage(error ? '❌ Lỗi cập nhật quyền project: ' + error.message : '✅ Đã cập nhật quyền project!');
    await loadSelectedUser(selectedUserId);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllCurrentPage() {
    const allIds = pwRows.map((u) => u.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

    setSelectedIds(allSelected ? new Set() : new Set(allIds));
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
        setSelectedIds(new Set());
      }
    } catch (e) {
      console.error(e);
      setMessage('Lỗi mạng khi gọi API reset mật khẩu.');
    } finally {
      setResetting(false);
    }
  }

  // ====== init ======
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

        if (cancelled) return;

        await loadProjects();

        // load trang 1 cho combobox + reset table ngay từ đầu
        await loadComboPage(1);
        await loadPwPage(1);
      } catch {
        router.push('/login');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // debounce query/role => reload page 1
  useEffect(() => {
    if (!isAdmin) return;
    loadComboPage(1);
    loadPwPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedComboQuery, roleFilter]);

  // outside click close combobox
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!comboRef.current) return;
      if (!comboRef.current.contains(e.target as Node)) setComboOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const comboTotalPages = useMemo(() => Math.max(1, Math.ceil(comboTotal / PAGE_SIZE)), [comboTotal]);
  const pwTotalPages = useMemo(() => Math.max(1, Math.ceil(pwTotal / PAGE_SIZE)), [pwTotal]);

  const userProjects = useMemo(() => {
    if (!selectedUserId) return [];
    return userPermissions.map((p) => ({
      permission_id: p.id,
      project_id: p.project_id,
      title: projects.find((pr) => pr.id === p.project_id)?.title || '',
      role: p.role,
    }));
  }, [userPermissions, projects, selectedUserId]);

  const availableProjects = useMemo(
    () => projects.filter((pr) => !userProjects.some((up) => up.project_id === pr.id)),
    [projects, userProjects]
  );

  // ====== GUARD ======
  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold mb-3">Quản lý người dùng</h1>
        <p className="text-sm text-red-600">{message || 'Bạn không có quyền truy cập chức năng này.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
      <section>
        <header className="border-b pb-3 mb-6">
          <h2 className="text-3xl font-extrabold text-indigo-800">Quản lý người dùng</h2>
          <p className="text-sm text-gray-600 mt-1">
            Tìm kiếm server-side + phân trang (không bị trần 1000 dòng). Reset mật khẩu về{' '}
            <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">12345678@</code>.
          </p>
        </header>

        {message && (
          <div className="mb-6 text-center py-2 rounded bg-green-50 text-green-700 shadow">
            {message}
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start mb-6">
          <div className="md:col-span-2" ref={comboRef}>
            <label className="block font-semibold mb-2 text-gray-700">Chọn người dùng (Combobox):</label>

            <div className="relative">
              <input
                className={INPUT}
                placeholder="Gõ email hoặc họ tên để tìm…"
                value={comboQuery}
                onChange={(e) => {
                  setComboQuery(e.target.value);
                  setComboOpen(true);
                }}
                onFocus={() => setComboOpen(true)}
              />

              {comboOpen && (
                <div className="absolute z-20 mt-2 w-full bg-white border rounded-xl shadow-lg">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <div className="text-xs text-gray-600">
                      {comboLoading ? 'Đang tải…' : `Kết quả: ${comboTotal} (Trang ${comboPage}/${comboTotalPages})`}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className={BTN_SECONDARY}
                        disabled={comboPage <= 1 || comboLoading}
                        onClick={() => loadComboPage(comboPage - 1)}
                      >
                        ◀
                      </button>
                      <button
                        className={BTN_SECONDARY}
                        disabled={comboPage >= comboTotalPages || comboLoading}
                        onClick={() => loadComboPage(comboPage + 1)}
                      >
                        ▶
                      </button>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-auto">
                    {comboRows.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500">Không có kết quả phù hợp.</div>
                    ) : (
                      <ul className="py-1">
                        {comboRows.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-3"
                              onClick={async () => {
                                setSelectedUserId(u.id);
                                setComboOpen(false);
                                await loadSelectedUser(u.id);
                              }}
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 truncate">{u.name || '(chưa có tên)'}</div>
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
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                className={BTN_SECONDARY}
                onClick={() => {
                  setSelectedUserId('');
                  setSelectedUser(null);
                  setUserPermissions([]);
                  setComboQuery('');
                  setComboOpen(false);
                }}
              >
                Xóa chọn
              </button>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-2 text-gray-700">Lọc theo quyền hệ thống:</label>
            <select className={INPUT} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">— Tất cả quyền —</option>
              {SYSTEM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected user card */}
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

              {/* ✅ Phân quyền hệ thống: luôn có khi selectedUser tồn tại */}
              <div className="flex items-center mt-2">
                <b>Quyền hệ thống:</b>
                <select
                  className="ml-2 border border-gray-300 rounded px-2 py-1 bg-gray-50 text-indigo-800"
                  value={selectedUser.role}
                  onChange={(e) => changeUserRole(e.target.value)}
                >
                  {SYSTEM_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
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
                    <option key={p.id} value={p.id}>{p.title}</option>
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
                    <span><b>{p.title}</b></span>
                    <span className="flex items-center gap-2">
                      <select
                        className="border rounded px-2 py-1 bg-indigo-50 text-indigo-800 text-xs font-semibold"
                        value={p.role}
                        onChange={(e) => changeProjectRole(p.permission_id, e.target.value)}
                      >
                        {SYSTEM_ROLES.filter((r) => r.value !== 'admin').map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
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
          </div>
        )}
      </section>

      {/* Reset password */}
      <section className="space-y-4">
        <header className="border-b pb-3">
          <h3 className="text-2xl font-bold">Quản lý mật khẩu</h3>
          <p className="text-sm text-gray-600 mt-1">
            Danh sách này dùng chung bộ lọc (từ khóa + quyền) và có phân trang, không bị giới hạn 100/1000.
          </p>
        </header>

        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-gray-700">
              {pwLoading ? 'Đang tải…' : `Tổng: ${pwTotal} | Trang ${pwPage}/${pwTotalPages}`}
            </div>

            <div className="flex items-center gap-2">
              <button className={BTN_SECONDARY} disabled={pwPage <= 1 || pwLoading} onClick={() => loadPwPage(pwPage - 1)}>
                ◀ Trang trước
              </button>
              <button className={BTN_SECONDARY} disabled={pwPage >= pwTotalPages || pwLoading} onClick={() => loadPwPage(pwPage + 1)}>
                Trang sau ▶
              </button>

              <button
                onClick={toggleSelectAllCurrentPage}
                className={BTN_SECONDARY}
                disabled={pwRows.length === 0}
              >
                {pwRows.length > 0 && pwRows.every((u) => selectedIds.has(u.id)) ? 'Bỏ chọn trang' : 'Chọn trang'}
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

          {pwRows.length === 0 ? (
            <p className="text-sm text-gray-600">Không có dữ liệu theo bộ lọc hiện tại.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-2 py-1 text-left w-10">
                      <input
                        type="checkbox"
                        checked={pwRows.length > 0 && pwRows.every((u) => selectedIds.has(u.id))}
                        onChange={toggleSelectAllCurrentPage}
                      />
                    </th>
                    <th className="px-2 py-1 text-left">Họ tên</th>
                    <th className="px-2 py-1 text-left">Email</th>
                    <th className="px-2 py-1 text-left">Vai trò</th>
                  </tr>
                </thead>
                <tbody>
                  {pwRows.map((u) => {
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
