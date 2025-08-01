'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

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
        id: uuidv4(),
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
