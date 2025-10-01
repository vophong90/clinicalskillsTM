'use client';

import React, { useState, useEffect, useMemo } from 'react';
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

type SortKey = 'item_order' | 'prompt' | 'code' | 'project' | 'round' | 'type';

export default function AdminItemManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [roundId, setRoundId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // sorting
  const [sortBy, setSortBy] = useState<SortKey>('item_order');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    void loadMasterData();
  }, []);

  useEffect(() => {
    void loadItems();
    setSelectedIds(new Set());
  }, [projectId, roundId]);

  async function loadMasterData() {
    setLoading(true);
    const [{ data: roundsData }, { data: projectsData }] = await Promise.all([
      supabase.from('rounds').select('id, round_number, project_id, status'),
      supabase.from('projects').select('id, title'),
    ]);
    setRounds((roundsData as Round[]) ?? []);
    setProjects((projectsData as Project[]) ?? []);
    await loadItems();
    setLoading(false);
  }

  async function loadItems() {
    setLoading(true);
    let q = supabase
      .from('items')
      .select('id, round_id, project_id, prompt, type, options_json, code, item_order, original_item_id');

    if (projectId) q = q.eq('project_id', projectId);
    if (roundId) q = q.eq('round_id', roundId);

    const { data: itemsData, error } = await q;
    if (error) setMessage('❌ Lỗi khi load item: ' + error.message);
    setItems((itemsData as Item[]) ?? []);
    setLoading(false);
  }

  const filteredRounds = useMemo(
    () => (projectId ? rounds.filter(r => r.project_id === projectId) : rounds),
    [rounds, projectId]
  );

  function getProjectTitle(pid: string) {
    return projects.find(p => p.id === pid)?.title ?? '';
  }
  function getRoundNumber(rid: string) {
    const r = rounds.find(rr => rr.id === rid);
    return r?.round_number ?? undefined;
  }

  const visibleItems = useMemo(() => {
    // sắp xếp theo sortBy/sortDir
    const arr = items.slice();
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortBy) {
        case 'item_order':
          av = a.item_order ?? 0;
          bv = b.item_order ?? 0;
          break;
        case 'prompt':
          av = (a.prompt ?? '').toLowerCase();
          bv = (b.prompt ?? '').toLowerCase();
          break;
        case 'code':
          av = (a.code ?? '').toLowerCase();
          bv = (b.code ?? '').toLowerCase();
          break;
        case 'project':
          av = getProjectTitle(a.project_id).toLowerCase();
          bv = getProjectTitle(b.project_id).toLowerCase();
          break;
        case 'round':
          av = getRoundNumber(a.round_id) ?? 0;
          bv = getRoundNumber(b.round_id) ?? 0;
          break;
        case 'type':
          av = (a.type ?? '').toLowerCase();
          bv = (b.type ?? '').toLowerCase();
          break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      // tie-breaker: giữ ổn định theo id
      return a.id.localeCompare(b.id);
    });
    return arr;
  }, [items, sortBy, sortDir, projects, rounds]);

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id));

  function toggleSelectOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const ids = visibleItems.map(i => i.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  }

  async function bulkDeleteSelected() {
    if (selectedIds.size === 0) return;
    setLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('items').delete().in('id', ids);
    if (error) setMessage('❌ Lỗi khi xóa: ' + error.message);
    else {
      setMessage(`🗑️ Đã xóa ${ids.length} item.`);
      setSelectedIds(new Set());
      await loadItems();
    }
    setLoading(false);
  }

  function findNextRoundForItem(item: Item): Round | undefined {
    const current = rounds.find(r => r.id === item.round_id);
    if (!current) return undefined;
    return rounds
      .filter(r => r.project_id === current.project_id && r.round_number > current.round_number)
      .sort((a, b) => a.round_number - b.round_number)[0];
  }

  async function bulkCloneToNextRound() {
    if (selectedIds.size === 0) return;

    setLoading(true);
    const ids = Array.from(selectedIds);
    const selectedItems = visibleItems.filter(i => ids.includes(i.id));

    let ok = 0;
    const noNext: string[] = [];
    const errs: string[] = [];

    for (const item of selectedItems) {
      const next = findNextRoundForItem(item);
      if (!next) {
        noNext.push(item.code || item.id);
        continue;
      }
      const { count, error: cntErr } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('round_id', next.id);
      if (cntErr) {
        errs.push(`${item.code || item.id}: ${cntErr.message}`);
        continue;
      }
      const nextOrder = (count ?? 0) + 1;

      const { error } = await supabase.from('items').insert([
        {
          id: crypto.randomUUID(),
          round_id: next.id,
          project_id: next.project_id,
          prompt: item.prompt,
          type: item.type,
          options_json: item.options_json,
          code: item.code,
          item_order: nextOrder,
          original_item_id: item.original_item_id || item.id,
        },
      ]);

      if (error) errs.push(`${item.code || item.id}: ${error.message}`);
      else ok += 1;
    }

    let msg = `➡️ Đã chuyển ${ok}/${ids.length} item sang vòng kế tiếp.`;
    if (noNext.length) msg += ` Không có vòng kế tiếp: ${noNext.join(', ')}.`;
    if (errs.length) msg += ` Lỗi: ${errs.join(' | ')}.`;
    setMessage(msg);

    await loadItems();
    setSelectedIds(new Set());
    setLoading(false);
  }

  const SortHeader: React.FC<{ label: string; k: SortKey; className?: string }> = ({ label, k, className }) => {
    const active = sortBy === k;
    const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '↕';
    return (
      <button
        type="button"
        className={`flex items-center gap-1 font-semibold ${className ?? ''}`}
        onClick={() => handleSort(k)}
        title={`Sắp xếp theo ${label}`}
      >
        {label} <span className="text-gray-500">{arrow}</span>
      </button>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">📝 Quản lý Item</h2>

      {message && <div className="mb-3 text-sm rounded border p-2 bg-emerald-50 border-emerald-200 text-emerald-800">{message}</div>}

      {/* BỘ LỌC + MENU CHUNG */}
      <div className="mb-4 flex flex-wrap items-center gap-2 border p-3 rounded bg-gray-50">
        <select
          className="border p-2 rounded min-w-48"
          value={projectId}
          onChange={e => {
            setProjectId(e.target.value);
            setRoundId('');
          }}
        >
          <option value="">— Lọc theo Project —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded min-w-48"
          value={roundId}
          onChange={e => setRoundId(e.target.value)}
        >
          <option value="">— Lọc theo Vòng —</option>
          {filteredRounds
            .slice()
            .sort((a, b) => a.round_number - b.round_number)
            .map(r => (
              <option key={r.id} value={r.id}>
                {(projects.find(p => p.id === r.project_id)?.title ?? 'Project')} – Vòng {r.round_number}
              </option>
            ))}
        </select>

        <div className="flex-1" />

        <button
          className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50"
          onClick={bulkCloneToNextRound}
          disabled={selectedIds.size === 0 || loading}
          title="Chuyển các câu đã chọn sang vòng kế tiếp tương ứng"
        >
          ➡️ Chuyển sang vòng tiếp theo
        </button>

        <button
          className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-50"
          onClick={bulkDeleteSelected}
          disabled={selectedIds.size === 0 || loading}
          title="Xóa các câu đã chọn"
        >
          🗑️ Xóa đã chọn
        </button>
      </div>

      {/* BẢNG */}
      {loading ? (
        <div>Đang tải...</div>
      ) : (
        <table className="min-w-full border text-sm bg-white shadow">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="Chọn tất cả"
                />
              </th>
              <th className="p-2"><SortHeader label="Thứ tự" k="item_order" /></th>
              <th className="p-2"><SortHeader label="Nội dung (prompt)" k="prompt" /></th>
              <th className="p-2"><SortHeader label="Code" k="code" /></th>
              <th className="p-2"><SortHeader label="Project" k="project" /></th>
              <th className="p-2"><SortHeader label="Round" k="round" /></th>
              <th className="p-2"><SortHeader label="Loại" k="type" /></th>
              <th className="p-2">Đáp án</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map(i => {
              const round = rounds.find(r => r.id === i.round_id);
              const project = projects.find(p => p.id === i.project_id);
              return (
                <tr key={i.id} className="border-t">
                  <td className="p-2 text-center align-top">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(i.id)}
                      onChange={() => toggleSelectOne(i.id)}
                      aria-label={`Chọn ${i.code || i.id}`}
                    />
                  </td>

                  {/* Hiển thị item_order, KHÔNG chỉnh trực tiếp */}
                  <td className="p-2 text-center align-top">{i.item_order ?? ''}</td>

                  <td className="p-2 align-top">{i.prompt}</td>
                  <td className="p-2 align-top">{i.code}</td>
                  <td className="p-2 align-top">{project?.title || ''}</td>
                  <td className="p-2 align-top">{round ? `Vòng ${round.round_number}` : ''}</td>
                  <td className="p-2 align-top">{i.type}</td>
                  <td className="p-2 align-top">
                    {Array.isArray(i.options_json?.choices) ? i.options_json.choices.join(' | ') : ''}
                  </td>
                </tr>
              );
            })}

            {visibleItems.length === 0 && (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan={8}>
                  Không có item nào phù hợp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
