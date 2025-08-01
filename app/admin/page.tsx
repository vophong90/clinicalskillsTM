'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ----------- TYPE KHAI BÁO ----------- //
type Item = {
  id: string;
  round_id: string;
  project_id: string;
  prompt: string;
  type: string;
  options_json: { choices: string[] };
  code: string;
  item_order?: number;
  original_item_id?: string | null;
};
type Round = { id: string; round_number: number; project_id: string; status?: string };
type Project = { id: string; title: string; status?: string };
type UserProfile = {
  id: string;
  email: string;
  name: string;
  role: string;
};

// ----------- USER MANAGER ----------- //
function AdminUserManager() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('id, email, name, role');
    if (error) setMessage('❌ Lỗi khi load user: ' + error.message);
    setUsers((data as UserProfile[]) ?? []);
    setLoading(false);
  }

  async function changeRole(userId: string, newRole: string) {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) setMessage('❌ Lỗi cập nhật quyền: ' + error.message);
    else setMessage('✅ Đã cập nhật quyền!');
    await loadUsers();
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">👥 Danh sách người dùng</h2>
      {loading && <div>⏳ Đang tải...</div>}
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Email</th>
            <th className="p-2">Tên</th>
            <th className="p-2">Quyền</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 &&
            <tr><td colSpan={3} className="text-center text-gray-400 p-8">Không có người dùng nào</td></tr>
          }
          {users.map(u => (
            <tr key={u.id}>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.name}</td>
              <td className="p-2">
                <select value={u.role || 'viewer'} onChange={e => changeRole(u.id, e.target.value)}>
                  <option value="admin">admin</option>
                  <option value="editor">editor</option>
                  <option value="secretary">secretary</option>
                  <option value="core_expert">core_expert</option>
                  <option value="external_expert">external_expert</option>
                  <option value="viewer">viewer</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------- PROJECT MANAGER ----------- //
function AdminProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('active');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase.from('projects').select('id, title, status');
    setProjects((data as Project[]) ?? []);
    setLoading(false);
  }

  async function createProject() {
    if (!title) return;
    const { error } = await supabase.from('projects').insert({ id: crypto.randomUUID(), title, status });
    if (error) setMessage('❌ Lỗi tạo project: ' + error.message);
    else setMessage('✅ Đã tạo Project mới!');
    setTitle('');
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

// ----------- ROUND MANAGER ----------- //
function AdminRoundManager() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [number, setNumber] = useState(1);
  const [status, setStatus] = useState('active');
  const [message, setMessage] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: roundsData } = await supabase.from('rounds').select('id, project_id, round_number, status');
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
      status
    });
    if (error) setMessage('❌ Lỗi tạo round: ' + error.message);
    else setMessage('✅ Đã tạo round mới!');
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
// ----------- ITEM MANAGER ----------- //
function AdminItemManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [roundId, setRoundId] = useState('');
  const [content, setContent] = useState('');
  const [itemType, setItemType] = useState('multi');
  const [options, setOptions] = useState<string[]>(['']);
  const [itemOrder, setItemOrder] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const { data: itemsData, error: itemErr } = await supabase.from('items')
      .select('id, round_id, project_id, prompt, type, options_json, code, item_order, original_item_id');
    if (itemErr) setMessage('❌ Lỗi khi load item: ' + itemErr.message);
    setItems((itemsData as Item[]) ?? []);
    const { data: roundsData } = await supabase.from('rounds').select('id, round_number, project_id');
    setRounds((roundsData as Round[]) ?? []);
    const { data: projectsData } = await supabase.from('projects').select('id, title');
    setProjects((projectsData as Project[]) ?? []);
    setLoading(false);
  }

  function handleOptionChange(idx: number, value: string) {
    const arr = [...options];
    arr[idx] = value;
    setOptions(arr);
  }
  function addOptionField() {
    setOptions([...options, '']);
  }
  function removeOptionField(idx: number) {
    setOptions(options.filter((_, i) => i !== idx));
  }
  function resetForm() {
    setProjectId('');
    setRoundId('');
    setContent('');
    setItemType('multi');
    setOptions(['']);
    setItemOrder('');
  }

  const filteredRounds = projectId ? rounds.filter(r => r.project_id === projectId) : rounds;

  async function createItem() {
    if (!roundId || !content) return;
    let finalOptions: string[] | null = null;
    if (['multi', 'radio', 'likert', 'binary'].includes(itemType)) {
      finalOptions = options.filter(o => o.trim());
      if (itemType === 'binary' && finalOptions.length === 0) finalOptions = ['Có', 'Không'];
    }
    const options_json = { choices: finalOptions ?? [] };
    const code = 'YHCT' + Math.floor(1000 + Math.random() * 9000);

    const selectedRound = rounds.find(r => r.id === roundId);
    const project_id = selectedRound ? selectedRound.project_id : null;
    if (!project_id) {
      setMessage('❌ Không xác định được project_id của round!');
      return;
    }

    let item_order = itemOrder ? parseInt(itemOrder, 10) : undefined;
    if (!item_order) {
      const { count } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('round_id', roundId);
      item_order = (count ?? 0) + 1;
    }

    const { error } = await supabase.from('items').insert([
      {
        id: crypto.randomUUID(),
        round_id: roundId,
        project_id,
        prompt: content,
        type: itemType,
        options_json,
        code,
        item_order,
        original_item_id: null,
      }
    ]);
    if (error) {
      setMessage('❌ Lỗi khi tạo item: ' + error.message);
      return;
    }
    setMessage('✅ Đã tạo item mới!');
    resetForm();
    await loadAll();
  }

  async function deleteItem(id: string) {
    await supabase.from('items').delete().eq('id', id);
    setMessage('🗑️ Đã xóa item!');
    await loadAll();
  }

  async function cloneItemToNextRound(item: Item) {
    const currentRound = rounds.find(r => r.id === item.round_id);
    if (!currentRound) {
      setMessage('Không tìm thấy round hiện tại!');
      return;
    }
    const nextRound = rounds
      .filter(r => r.project_id === currentRound.project_id && r.round_number > currentRound.round_number)
      .sort((a, b) => a.round_number - b.round_number)[0];

    if (!nextRound) {
      setMessage('❌ Không có round kế tiếp trong project này!');
      return;
    }
    const { count } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', nextRound.id);
    const nextOrder = (count ?? 0) + 1;

    await supabase.from('items').insert([
      {
        id: crypto.randomUUID(),
        round_id: nextRound.id,
        project_id: nextRound.project_id,
        prompt: item.prompt,
        type: item.type,
        options_json: item.options_json,
        code: item.code,
        item_order: nextOrder,
        original_item_id: item.original_item_id || item.id,
      }
    ]);
    setMessage('✅ Đã clone item sang round tiếp theo!');
    await loadAll();
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">📝 Quản lý Item</h2>
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <form className="mb-4 flex flex-col gap-2 border p-4 rounded bg-gray-50">
        <div className="flex flex-wrap gap-2">
          <select className="border p-2" value={projectId} onChange={e => {
            setProjectId(e.target.value);
            setRoundId('');
          }}>
            <option value="">Chọn Project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select className="border p-2" value={roundId} onChange={e => setRoundId(e.target.value)}>
            <option value="">Chọn Round</option>
            {filteredRounds.map(r =>
              <option key={r.id} value={r.id}>
                {projects.find(p => p.id === r.project_id)?.title || ''} - Vòng {r.round_number}
              </option>
            )}
          </select>
          <select className="border p-2" value={itemType} onChange={e => {
            setItemType(e.target.value);
            if (e.target.value === 'binary') setOptions(['Có', 'Không']);
            else setOptions(['']);
          }}>
            <option value="multi">Chọn nhiều đáp án</option>
            <option value="radio">Chọn 1 đáp án</option>
            <option value="likert">Thang Likert</option>
            <option value="binary">Nhị giá (Có/Không, Đúng/Sai)</option>
            <option value="text">Nhập tự do</option>
          </select>
          <input
            className="border p-2"
            type="number"
            min={1}
            value={itemOrder}
            onChange={e => setItemOrder(e.target.value)}
            placeholder="Thứ tự câu hỏi (item_order)"
          />
        </div>
        <input className="border p-2" value={content} onChange={e=>setContent(e.target.value)} placeholder="Nội dung câu hỏi (prompt)" />
        {['multi', 'radio', 'likert', 'binary'].includes(itemType) &&
          <div className="pl-2">
            <label className="block font-semibold mb-1">Đáp án:</label>
            {options.map((opt, idx) => (
              <div className="flex items-center gap-2 mb-1" key={idx}>
                <input
                  className="border p-1 w-60"
                  value={opt}
                  onChange={e => handleOptionChange(idx, e.target.value)}
                  placeholder={`Đáp án ${idx+1}`}
                  disabled={itemType === 'binary'}
                />
                {options.length > 1 && itemType !== 'binary' &&
                  <button type="button" className="text-red-500" onClick={() => removeOptionField(idx)}>✕</button>
                }
              </div>
            ))}
            {itemType !== 'binary' &&
              <button type="button" className="text-blue-600 text-sm" onClick={addOptionField}>+ Thêm đáp án</button>
            }
          </div>
        }
        <button type="button" onClick={createItem} className="bg-blue-600 text-white px-4 py-2 rounded w-fit mt-2">➕ Tạo Item</button>
      </form>
      {loading ? <div>Đang tải...</div> :
      <table className="min-w-full border text-sm bg-white shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">STT</th>
            <th className="p-2">Nội dung (prompt)</th>
            <th className="p-2">Code</th>
            <th className="p-2">Project</th>
            <th className="p-2">Round</th>
            <th className="p-2">Loại</th>
            <th className="p-2">Đáp án</th>
            <th className="p-2">Chuyển sang round tiếp theo</th>
            <th className="p-2">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items
            .sort((a, b) => (a.item_order || 0) - (b.item_order || 0))
            .map((i, idx) => {
              const round = rounds.find(r=>r.id===i.round_id);
              const project = projects.find(p => p.id === i.project_id);
              return (
                <tr key={i.id}>
                  <td className="p-2">{i.item_order || idx+1}</td>
                  <td className="p-2">{i.prompt}</td>
                  <td className="p-2">{i.code}</td>
                  <td className="p-2">{project?.title || ""}</td>
                  <td className="p-2">{round ? `Vòng ${round.round_number}` : ''}</td>
                  <td className="p-2">{i.type}</td>
                  <td className="p-2">{Array.isArray(i.options_json?.choices) ? i.options_json.choices.join(' | ') : ""}</td>
                  <td className="p-2">
                    <button className="bg-green-600 text-white px-2 py-1 rounded" onClick={() => cloneItemToNextRound(i)}>
                      ➡️ Chuyển sang round tiếp theo
                    </button>
                  </td>
                  <td className="p-2">
                    <button className="text-red-500" onClick={()=>deleteItem(i.id)}>🗑️ Xóa</button>
                  </td>
                </tr>
              )
          })}
        </tbody>
      </table>
      }
    </div>
  );
}

// ------------- MAIN ADMIN PAGE -------------
export default function AdminPage() {
  const [tab, setTab] = useState<'users'|'projects'|'rounds'|'items'>('items');
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
