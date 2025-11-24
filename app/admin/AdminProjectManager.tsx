'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Project = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  created_by?: string;
};

export default function AdminProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('id, title, description, status, created_by');
    setProjects((data as Project[]) ?? []);
    setLoading(false);
  }

  async function createProject() {
    if (!title) return;
    // Lấy user id hiện tại
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage('❌ Bạn chưa đăng nhập!');
      return;
    }
    const created_by = user.id;
    const { error } = await supabase.from('projects').insert({
      id: crypto.randomUUID(),
      title,
      description,
      status,
      created_by,
    });
    if (error) setMessage('❌ Lỗi tạo project: ' + error.message);
    else setMessage('✅ Đã tạo Project mới!');
    setTitle('');
    setDescription('');
    setStatus('active');
    await loadProjects();
  }

  async function deleteProject(id: string) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) setMessage('❌ Lỗi xóa: ' + error.message);
    else setMessage('🗑️ Đã xóa Project!');
    await loadProjects();
  }

  return (
    <div className="w-full mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">📁 Danh sách Project</h2>
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <form className="mb-4 flex flex-col gap-2">
        <input
          className="border p-2"
          placeholder="Tên Project"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          className="border p-2"
          placeholder="Mô tả (description)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <select className="border p-2" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Đang hoạt động</option>
          <option value="closed">Đã đóng</option>
        </select>
        <button
          type="button"
          onClick={createProject}
          className="bg-blue-600 text-white px-4 py-2 rounded w-fit"
        >
          ➕ Tạo Project
        </button>
      </form>
      {loading && <div>Đang tải...</div>}
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Tên</th>
            <th className="p-2">Mô tả</th>
            <th className="p-2">Trạng thái</th>
            <th className="p-2">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id}>
              <td className="p-2">{p.title}</td>
              <td className="p-2">{p.description}</td>
              <td className="p-2">{p.status}</td>
              <td className="p-2">
                <button className="text-red-500" onClick={() => deleteProject(p.id)}>
                  🗑️ Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
