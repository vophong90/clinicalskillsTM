'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AdminUserPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRound, setSelectedRound] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchRounds = async () => {
      const { data, error } = await supabase.from('rounds').select('id, round_number');
      if (data) setRounds(data);
    };
    fetchRounds();
  }, []);

  const handleCreateUser = async () => {
    setMessage('⏳ Đang tạo user...');

    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false
    });

    if (userError) {
      setMessage('❌ Lỗi khi tạo user: ' + userError.message);
      return;
    }

    const user_id = userData.user.id;

    await supabase.from('profiles').insert({
      id: user_id,
      email,
      app_role: role
    });

    if (selectedRound) {
      await supabase.from('round_participants').insert({
        id: crypto.randomUUID(),
        round_id: selectedRound,
        user_id: user_id,
        invited_by: null // sửa sau nếu có current admin
      });
    }

    setMessage('✅ Tạo user và phân quyền thành công!');
    setEmail('');
    setPassword('');
    setRole('viewer');
    setSelectedRound('');
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">👤 Tạo người dùng mới</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 mb-2 w-full"
      />

      <input
        type="password"
        placeholder="Mật khẩu"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 mb-2 w-full"
      />

      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="border p-2 mb-2 w-full"
      >
        <option value="viewer">Viewer</option>
        <option value="editor">Editor</option>
        <option value="admin">Admin</option>
      </select>

      <select
        value={selectedRound}
        onChange={(e) => setSelectedRound(e.target.value)}
        className="border p-2 mb-2 w-full"
      >
        <option value="">Không thêm vào vòng nào</option>
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            Vòng #{r.round_number}
          </option>
        ))}
      </select>

      <button
        onClick={handleCreateUser}
        className="bg-green-600 text-white px-4 py-2 rounded w-full hover:bg-green-700"
      >
        ➕ Tạo người dùng
      </button>

      {message && <p className="mt-4 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

// --- BẮT ĐẦU PHẦN QUẢN LÝ USER ---
function AdminUserManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    // Lấy danh sách user + profile
    const { data: profiles } = await supabase.from('profiles').select('id, email, name, app_role');
    // Lấy rounds
    const { data: roundsData } = await supabase.from('rounds').select('id, round_number, status');
    setUsers(profiles || []);
    setRounds(roundsData || []);
    setLoading(false);
  }

  // Đổi quyền user
  async function changeRole(userId: string, newRole: string) {
    await supabase.from('profiles').update({ app_role: newRole }).eq('id', userId);
    setMessage('✅ Đã cập nhật quyền!');
    loadAll();
  }

  // Thêm user vào round
  async function addToRound(userId: string, roundId: string) {
    await supabase.from('round_participants').insert({
      id: crypto.randomUUID(),
      round_id: roundId,
      user_id: userId
    });
    setMessage('✅ Đã thêm vào round!');
    loadAll();
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">👥 Danh sách người dùng</h2>
      {loading && <div>⏳ Đang tải...</div>}
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Email</th>
            <th className="p-2">Tên</th>
            <th className="p-2">Quyền</th>
            <th className="p-2">Phân quyền</th>
            <th className="p-2">Thêm vào round</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.name}</td>
              <td className="p-2">{u.app_role}</td>
              <td className="p-2">
                <select value={u.app_role || 'viewer'} onChange={e => changeRole(u.id, e.target.value)}>
                  <option value="admin">admin</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              </td>
              <td className="p-2">
                <select onChange={e => addToRound(u.id, e.target.value)} defaultValue="">
                  <option value="">Chọn round</option>
                  {rounds.map(r =>
                    <option key={r.id} value={r.id}>Vòng {r.round_number} ({r.status})</option>
                  )}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- ĐOẠN EXPORT CHÍNH ---
// Kết hợp cả hai thành phần vào 1 trang
export default function AdminPage() {
  return (
    <div>
      <AdminUserPanel />
      <hr className="my-8" />
      <AdminUserManager />
    </div>
  );
}
