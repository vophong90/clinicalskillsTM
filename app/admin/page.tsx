'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ---- USER MANAGER ----
function AdminUserManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('id, email, name, app_role');
    const { data: roundsData } = await supabase.from('rounds').select('id, round_number, status, project_id');
    const { data: participantsData } = await supabase.from('round_participants').select('id, user_id, round_id');
    const { data: projectsData } = await supabase.from('projects').select('id, title');
    const { data: permissionsData } = await supabase.from('permissions').select('id, user_id, project_id, role');
    setUsers(profiles || []);
    setRounds(roundsData || []);
    setParticipants(participantsData || []);
    setProjects(projectsData || []);
    setPermissions(permissionsData || []);
    setLoading(false);
  }

  // Đổi quyền user (toàn cục)
  async function changeRole(userId: string, newRole: string) {
    await supabase.from('profiles').update({ app_role: newRole }).eq('id', userId);
    setMessage('✅ Đã cập nhật quyền!');
    loadAll();
  }

  // Gán user vào project
  async function addToProject(userId: string, projectId: string, role: string) {
    await supabase.from('permissions').upsert([
      { id: crypto.randomUUID(), user_id: userId, project_id: projectId, role }
    ], { onConflict:'user_id,project_id'});
    setMessage('✅ Đã gán user vào project!');
    loadAll();
  }

  // Gán user vào round
  async function addToRound(userId: string, roundId: string) {
    await supabase.from('round_participants').insert({
      id: crypto.randomUUID(),
      round_id: roundId,
      user_id: userId
    });
    setMessage('✅ Đã thêm vào round!');
    loadAll();
  }

  // Xoá user khỏi round
  async function removeFromRound(participantId: string) {
    await supabase.from('round_participants').delete().eq('id', participantId);
    setMessage('✅ Đã xoá user khỏi round!');
    loadAll();
  }

  // Xoá user khỏi project
  async function removeFromProject(userId: string, projectId: string) {
    await supabase.from('permissions').delete().eq('user_id', userId).eq('project_id', projectId);
    setMessage('✅ Đã xoá user khỏi project!');
    loadAll();
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">👥 Danh sách người dùng</h2>
      {loading && <div>⏳ Đang tải...</div>}
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Email</th>
            <th className="p-2">Tên</th>
            <th className="p-2">Quyền toàn cục</th>
            <th className="p-2">Phân quyền</th>
            <th className="p-2">Gán vào Project</th>
            <th className="p-2">Gán vào Round</th>
            <th className="p-2">Vòng đã tham gia</th>
            <th className="p-2">Project đã tham gia</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.name}</td>
              <td className="p-2">
                <select value={u.app_role || 'viewer'} onChange={e => changeRole(u.id, e.target.value)}>
                  <option value="admin">admin</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              </td>
              <td className="p-2">
                <select onChange={e => addToProject(u.id, e.target.value, 'core_expert')} defaultValue="">
                  <option value="">Gán vào Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <select onChange={e => addToProject(u.id, e.target.value, 'core_expert')} defaultValue="">
                  <option value="">Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
                <br/>
                <select onChange={e => addToProject(u.id, e.target.value, 'external_expert')} defaultValue="">
                  <option value="">Project (external)</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <select onChange={e => addToRound(u.id, e.target.value)} defaultValue="">
                  <option value="">Gán vào Round</option>
                  {rounds.map(r =>
                    <option key={r.id} value={r.id}>Vòng {r.round_number} (project {projects.find(p=>p.id===r.project_id)?.title || ''})</option>
                  )}
                </select>
              </td>
              <td className="p-2">
                {participants.filter(p => p.user_id === u.id).length > 0
                  ? participants
                      .filter(p => p.user_id === u.id)
                      .map(p => {
                        const round = rounds.find(r => r.id === p.round_id);
                        return round
                          ? (
                              <span key={p.id} className="inline-block bg-gray-100 px-2 py-1 m-1 rounded">
                                V{round.round_number}
                                <button
                                  className="text-red-500 ml-1"
                                  onClick={() => removeFromRound(p.id)}
                                  title="Xoá khỏi round"
                                >✕</button>
                              </span>
                            )
                          : null;
                      })
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="p-2">
                {permissions.filter(p => p.user_id === u.id).length > 0
                  ? permissions
                      .filter(p => p.user_id === u.id)
                      .map(p => {
                        const project = projects.find(pr => pr.id === p.project_id);
                        return project
                          ? (
                              <span key={p.id} className="inline-block bg-gray-100 px-2 py-1 m-1 rounded">
                                {project.title}
                                <button
                                  className="text-red-500 ml-1"
                                  onClick={() => removeFromProject(u.id, project.id)}
                                  title="Xoá khỏi project"
                                >✕</button>
                              </span>
                            )
                          : null;
                      })
                  : <span className="text-gray-400">-</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- PROJECT MANAGER ----
function AdminProjectManager() {
  const [projects, setProjects] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('active');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase.from('projects').select('id, title, status');
    setProjects(data || []);
    setLoading(false);
  }

  async function createProject() {
    if (!title) return;
    await supabase.from('projects').insert({ id: crypto.randomUUID(), title, status });
    setMessage('✅ Đã tạo Project mới!');
    setTitle('');
    setStatus('active');
    loadProjects();
  }

  async function deleteProject(id: string) {
    await supabase.from('projects').delete().eq('id', id);
    setMessage('🗑️ Đã xóa Project!');
    loadProjects();
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">📁 Danh sách Project</h2>
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <form className="mb-4 flex flex-col gap-2">
        <input className="border p-2" placeholder="Tên Project" value={title} onChange={e=>setTitle(e.target.value)} />
        <select className="border p-2" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="active">Đang hoạt động</option>
          <option value="closed">Đã đóng</option>
        </select>
        <button type="button" onClick={createProject} className="bg-blue-600 text-white px-4 py-2 rounded w-fit">➕ Tạo Project</button>
      </form>
      {loading && <div>Đang tải...</div>}
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Tên</th>
            <th className="p-2">Trạng thái</th>
            <th className="p-2">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id}>
              <td className="p-2">{p.title}</td>
              <td className="p-2">{p.status}</td>
              <td className="p-2">
                <button className="text-red-500" onClick={()=>deleteProject(p.id)}>🗑️ Xóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- ROUND MANAGER ----
function AdminRoundManager() {
  const [rounds, setRounds] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [number, setNumber] = useState(1);
  const [status, setStatus] = useState('active');
  const [message, setMessage] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: roundsData } = await supabase.from('rounds').select('id, project_id, round_number, status');
    const { data: projectsData } = await supabase.from('projects').select('id, title');
    setRounds(roundsData || []);
    setProjects(projectsData || []);
  }

  async function createRound() {
    if (!projectId) return;
    await supabase.from('rounds').insert({
      id: crypto.randomUUID(),
      project_id: projectId,
      round_number: number,
      status
    });
    setMessage('✅ Đã tạo round mới!');
    loadAll();
  }

  async function deleteRound(id: string) {
    await supabase.from('rounds').delete().eq('id', id);
    setMessage('🗑️ Đã xóa round!');
    loadAll();
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">🔄 Quản lý Round</h2>
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <form className="mb-4 flex flex-col gap-2">
        <select className="border p-2" value={projectId} onChange={e=>setProjectId(e.target.value)}>
          <option value="">Chọn Project</option>
          {projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <input className="border p-2" type="number" min={1} value={number} onChange={e=>setNumber(Number(e.target.value))} placeholder="Số thứ tự round" />
        <select className="border p-2" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="active">Đang mở</option>
          <option value="closed">Đã đóng</option>
        </select>
        <button type="button" onClick={createRound} className="bg-blue-600 text-white px-4 py-2 rounded w-fit">➕ Tạo Round</button>
      </form>
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Project</th>
            <th className="p-2">Số vòng</th>
            <th className="p-2">Trạng thái</th>
            <th className="p-2">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map(r => (
            <tr key={r.id}>
              <td className="p-2">{projects.find(p=>p.id===r.project_id)?.title || ''}</td>
              <td className="p-2">{r.round_number}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2">
                <button className="text-red-500" onClick={()=>deleteRound(r.id)}>🗑️ Xóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- ITEM MANAGER ----
function AdminItemManager() {
  const [items, setItems] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [roundId, setRoundId] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: itemsData } = await supabase.from('items').select('id, content, round_id');
    const { data: roundsData } = await supabase.from('rounds').select('id, round_number');
    setItems(itemsData || []);
    setRounds(roundsData || []);
  }

  async function createItem() {
    if (!roundId || !content) return;
    await supabase.from('items').insert({
      id: crypto.randomUUID(),
      round_id: roundId,
      content
    });
    setMessage('✅ Đã tạo item mới!');
    setContent('');
    loadAll();
  }

  async function deleteItem(id: string) {
    await supabase.from('items').delete().eq('id', id);
    setMessage('🗑️ Đã xóa item!');
    loadAll();
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">📝 Quản lý Item</h2>
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <form className="mb-4 flex flex-col gap-2">
        <select className="border p-2" value={roundId} onChange={e=>setRoundId(e.target.value)}>
          <option value="">Chọn Round</option>
          {rounds.map(r=><option key={r.id} value={r.id}>Vòng {r.round_number}</option>)}
        </select>
        <input className="border p-2" value={content} onChange={e=>setContent(e.target.value)} placeholder="Nội dung Item" />
        <button type="button" onClick={createItem} className="bg-blue-600 text-white px-4 py-2 rounded w-fit">➕ Tạo Item</button>
      </form>
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Nội dung</th>
            <th className="p-2">Round</th>
            <th className="p-2">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td className="p-2">{i.content}</td>
              <td className="p-2">{rounds.find(r=>r.id===i.round_id)?.round_number || ''}</td>
              <td className="p-2">
                <button className="text-red-500" onClick={()=>deleteItem(i.id)}>🗑️ Xóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- MAIN ADMIN PAGE ----
export default function AdminPage() {
  const [tab, setTab] = useState<'users'|'projects'|'rounds'|'items'>('users');

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-100 border-r px-4 py-8">
        <nav>
          <ul className="space-y-3">
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'users' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('users')}
              >👤 Người dùng</button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'projects' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('projects')}
              >📁 Project</button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'rounds' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('rounds')}
              >🔄 Round</button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'items' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('items')}
              >📝 Item</button>
            </li>
          </ul>
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 p-8 bg-white">
        {tab === 'users' && <AdminUserManager />}
        {tab === 'projects' && <AdminProjectManager />}
        {tab === 'rounds' && <AdminRoundManager />}
        {tab === 'items' && <AdminItemManager />}
      </main>
    </div>
  );
}
