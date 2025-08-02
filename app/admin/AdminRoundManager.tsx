'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Round = { id: string; round_number: number; project_id: string; status?: string; description?: string };
type Project = { id: string; title: string };

export default function AdminRoundManager() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [number, setNumber] = useState(1);
  const [status, setStatus] = useState('active');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: roundsData } = await supabase
      .from('rounds')
      .select('id, project_id, round_number, status, description')
      .order('round_number', { ascending: true });
    setRounds((roundsData as Round[]) ?? []);
    const { data: projectsData } = await supabase.from('projects').select('id, title');
    setProjects((projectsData as Project[]) ?? []);
  }

  async function createRound() {
    if (!projectId) return;
    const { error } = await supabase.from('rounds').insert({
      id: crypto.randomUUID(),
      project_id: projectId,
      round_number: number,
      status,
      description,
    });
    if (error) setMessage('❌ Lỗi tạo round: ' + error.message);
    else {
      setMessage('✅ Đã tạo round mới!');
      setDescription('');
    }
    await loadAll();
  }

  async function deleteRound(id: string) {
    const { error } = await supabase.from('rounds').delete().eq('id', id);
    if (error) setMessage('❌ Lỗi xóa round: ' + error.message);
    else setMessage('🗑️ Đã xóa round!');
    await loadAll();
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">🔄 Quản lý Round</h2>
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <form className="mb-4 flex flex-col gap-2">
        <select className="border p-2" value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">Chọn Project</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <input
          className="border p-2"
          type="number"
          min={1}
          value={number}
          onChange={e => setNumber(Number(e.target.value))}
          placeholder="Số thứ tự round"
        />
        <select className="border p-2" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Đang mở</option>
          <option value="closed">Đã đóng</option>
        </select>
        <textarea
          className="border p-2"
          placeholder="Nhập mô tả cho round (hướng dẫn, thời gian, ...)"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <button type="button" onClick={createRound} className="bg-blue-600 text-white px-4 py-2 rounded w-fit">
          ➕ Tạo Round
        </button>
      </form>
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Project</th>
            <th className="p-2">Số vòng</th>
            <th className="p-2">Trạng thái</th>
            <th className="p-2">Mô tả</th>
            <th className="p-2">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map(r => (
            <tr key={r.id}>
              <td className="p-2">{projects.find(p => p.id === r.project_id)?.title || ''}</td>
              <td className="p-2 text-center">{r.round_number}</td>
              <td className="p-2 text-center">{r.status === 'active' ? 'Đang mở' : 'Đã đóng'}</td>
              <td className="p-2 whitespace-pre-line max-w-xs">{r.description}</td>
              <td className="p-2">
                <button className="text-red-500" onClick={() => deleteRound(r.id)}>🗑️ Xóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
