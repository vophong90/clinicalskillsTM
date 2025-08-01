'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
type Project = { id: string; title: string };

export default function AdminItemManager() {
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
      <th className="p-2">Thứ tự</th>
      <th className="p-2">Nội dung (prompt)</th>
      <th className="p-2">Code</th>
      <th className="p-2">Project</th>
      <th className="p-2">Round</th>
      <th className="p-2">Loại</th>
      <th className="p-2">Đáp án</th>
      <th className="p-2">Chuyển round</th>
      <th className="p-2">Thao tác</th>
    </tr>
  </thead>
  <tbody>
    {items
      .sort((a, b) => (a.item_order || 0) - (b.item_order || 0))
      .map((i, idx) => {
        const round = rounds.find(r => r.id === i.round_id);
        const project = projects.find(p => p.id === i.project_id);
        return (
          <tr key={i.id}>
            {/* ----- Cột Thứ tự (Order) với input sửa trực tiếp ----- */}
            <td className="p-2 text-center">
              <input
                type="number"
                min={1}
                value={i.item_order ?? ''}
                style={{ width: 54 }}
                onChange={async (e) => {
                  const newOrder = Number(e.target.value);
                  // Nếu giá trị mới hợp lệ, cập nhật order vào DB và reload bảng
                  if (newOrder > 0 && newOrder !== i.item_order) {
                    await supabase.from('items').update({ item_order: newOrder }).eq('id', i.id);
                    await loadAll();
                  }
                }}
                className="border rounded w-14 text-center"
              />
            </td>
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
              <button className="text-red-500" onClick={() => deleteItem(i.id)}>🗑️ Xóa</button>
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
