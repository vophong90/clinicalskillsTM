'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Round = {
  id: string;
  project_id: string;
  round_number: number;
  status: string;
  description: string | null;
  open_at: string | null;
  close_at: string | null;
  created_at: string;
};

type Project = { id: string; title: string };

const INPUT =
  'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN_PRIMARY =
  'inline-flex items-center px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center px-3 py-2 rounded-lg font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50';
const BTN_DANGER =
  'inline-flex items-center px-3 py-2 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50';

const PAGE_SIZE = 50;

const ROUND_STATUS_OPTIONS = [
  { value: 'draft', label: 'Bản nháp' },
  { value: 'active', label: 'Hoạt động' },
  { value: 'closed', label: 'Đã đóng' },
] as const;

function viRoundStatus(value: string) {
  return ROUND_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function statusPillClass(value: string) {
  switch (value) {
    case 'draft':
      return 'bg-gray-100 text-gray-700';
    case 'active':
      return 'bg-green-100 text-green-700';
    case 'closed':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function toStartOfDayISO(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}
function toNextDayStartISO(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function formatLocalDT(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseLocalDT(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return d.toISOString();
}

export default function AdminRoundManager() {
  // ===== DATA =====
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [total, setTotal] = useState(0);

  // ===== UI =====
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // ===== PAGINATION =====
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // ===== CREATE (multi-project) =====
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  const [autoNumber, setAutoNumber] = useState(true);
  const [manualNumber, setManualNumber] = useState(1);
  const [createStatus, setCreateStatus] =
    useState<(typeof ROUND_STATUS_OPTIONS)[number]['value']>('active');
  const [createDescription, setCreateDescription] = useState('');
  const [createOpenAt, setCreateOpenAt] = useState<string>(''); // datetime-local
  const [createCloseAt, setCreateCloseAt] = useState<string>(''); // datetime-local
  const [creating, setCreating] = useState(false);

  // ===== FILTERS (LIST) =====
  const [filterProjectId, setFilterProjectId] = useState<string>(''); // NEW
  const [filterStatus, setFilterStatus] = useState<string>(''); // '' all
  const [dateFrom, setDateFrom] = useState<string>(''); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(''); // YYYY-MM-DD

  // ===== FILTERS (CREATE PROJECT PICKER) =====
  const [createProjectFilterId, setCreateProjectFilterId] = useState<string>(''); // NEW
  const [createProjectSearch, setCreateProjectSearch] = useState<string>(''); // NEW

  // ===== INLINE EDIT =====
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        round_number: number;
        status: string;
        description: string;
        open_at: string;
        close_at: string;
      }
    >
  >({});
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    loadProjects();
    loadRounds(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRounds(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProjectId, filterStatus, dateFrom, dateTo]);

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, title')
      .order('created_at', { ascending: false });

    if (error) {
      setMessage('❌ Lỗi tải projects: ' + error.message);
      setProjects([]);
      return;
    }
    setProjects((data as Project[]) ?? []);
  }

  async function loadRounds(nextPage: number) {
    setLoading(true);
    setMessage('');

    const from = (nextPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from('rounds')
      .select('id, project_id, round_number, status, description, open_at, close_at, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    if (filterProjectId) q = q.eq('project_id', filterProjectId);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (dateFrom) q = q.gte('created_at', toStartOfDayISO(dateFrom));
    if (dateTo) q = q.lt('created_at', toNextDayStartISO(dateTo));

    const { data, error, count } = await q.range(from, to);

    if (error) {
      setRounds([]);
      setTotal(0);
      setMessage('❌ Lỗi tải rounds: ' + error.message);
      setLoading(false);
      return;
    }

    const rows = (data as Round[]) ?? [];
    setRounds(rows);
    setTotal(count ?? 0);
    setPage(nextPage);

    // init drafts
    setDrafts((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        if (!next[r.id]) {
          next[r.id] = {
            round_number: r.round_number,
            status: r.status,
            description: r.description ?? '',
            open_at: formatLocalDT(r.open_at),
            close_at: formatLocalDT(r.close_at),
          };
        }
      });
      return next;
    });

    setLoading(false);
  }

  // ===== helpers =====
  const projectTitleById = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.title));
    return m;
  }, [projects]);

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelectedProjects() {
    setSelectedProjectIds(new Set());
  }

  function toggleSelectAllVisibleProjects(visible: Project[]) {
    setSelectedProjectIds((prev) => {
      const allVisibleSelected = visible.every((p) => prev.has(p.id));
      const next = new Set(prev);

      if (allVisibleSelected) {
        visible.forEach((p) => next.delete(p.id));
      } else {
        visible.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  // ===== visible projects in CREATE picker (filter + search) =====
  const createVisibleProjects = useMemo(() => {
    let list = projects;

    if (createProjectFilterId) {
      list = list.filter((p) => p.id === createProjectFilterId);
    }

    const kw = createProjectSearch.trim().toLowerCase();
    if (kw) {
      list = list.filter((p) => p.title.toLowerCase().includes(kw));
    }

    return list;
  }, [projects, createProjectFilterId, createProjectSearch]);

  // ===== CREATE multi =====
  async function createRoundsForSelectedProjects() {
    setMessage('');
    if (selectedProjectIds.size === 0) {
      setMessage('❌ Vui lòng chọn ít nhất 1 Project.');
      return;
    }

    const ok = window.confirm(
      autoNumber
        ? `Tạo round cho ${selectedProjectIds.size} project (số vòng tự động: max+1 theo từng project)?`
        : `Tạo round #${manualNumber} cho ${selectedProjectIds.size} project?`
    );
    if (!ok) return;

    setCreating(true);
    try {
      const selectedIds = Array.from(selectedProjectIds);

      // 1) auto number: max+1 each project
      let nextNumberByProject = new Map<string, number>();
      if (autoNumber) {
        const PAGE = 1000;
        let from = 0;
        const all: Array<{ project_id: string; round_number: number }> = [];

        while (true) {
          const { data, error } = await supabase
            .from('rounds')
            .select('project_id, round_number')
            .in('project_id', selectedIds)
            .order('project_id', { ascending: true })
            .order('round_number', { ascending: true })
            .range(from, from + PAGE - 1);

          if (error) throw error;
          all.push(...(((data as any[]) ?? []) as any));
          if (!data || data.length < PAGE) break;
          from += PAGE;
        }

        const maxByProject = new Map<string, number>();
        selectedIds.forEach((pid) => maxByProject.set(pid, 0));
        all.forEach((r) => {
          const cur = maxByProject.get(r.project_id) ?? 0;
          if (r.round_number > cur) maxByProject.set(r.project_id, r.round_number);
        });

        selectedIds.forEach((pid) => {
          const maxN = maxByProject.get(pid) ?? 0;
          nextNumberByProject.set(pid, maxN + 1);
        });
      } else {
        selectedIds.forEach((pid) => nextNumberByProject.set(pid, manualNumber));
      }

      // 2) insert batch
      const open_at = createOpenAt ? parseLocalDT(createOpenAt) : null;
      const close_at = createCloseAt ? parseLocalDT(createCloseAt) : null;

      const inserts = selectedIds.map((pid) => ({
        project_id: pid,
        round_number: nextNumberByProject.get(pid) ?? 1,
        status: createStatus,
        description: createDescription.trim() ? createDescription.trim() : null,
        open_at,
        close_at,
      }));

      const { error } = await supabase.from('rounds').insert(inserts);
      if (error) throw error;

      setMessage(`✅ Đã tạo round cho ${selectedIds.length} project.`);
      setCreateDescription('');
      setCreateOpenAt('');
      setCreateCloseAt('');
      await loadRounds(1);
    } catch (e: any) {
      setMessage('❌ Lỗi tạo round hàng loạt: ' + (e?.message ?? String(e)));
    } finally {
      setCreating(false);
    }
  }

  // ===== UPDATE / DELETE =====
  async function updateRound(id: string) {
    setMessage('');
    const d = drafts[id];
    if (!d) return;

    setSavingId(id);
    try {
      const payload = {
        round_number: Number(d.round_number),
        status: d.status,
        description: d.description.trim() ? d.description.trim() : null,
        open_at: d.open_at ? parseLocalDT(d.open_at) : null,
        close_at: d.close_at ? parseLocalDT(d.close_at) : null,
      };

      const { error } = await supabase.from('rounds').update(payload).eq('id', id);
      if (error) throw error;

      setMessage('✅ Đã cập nhật round!');
      await loadRounds(page);
    } catch (e: any) {
      setMessage('❌ Lỗi cập nhật: ' + (e?.message ?? String(e)));
    } finally {
      setSavingId('');
    }
  }

  async function deleteRound(id: string) {
    const ok = window.confirm('Bạn chắc chắn muốn xóa round này? Hành động không thể hoàn tác.');
    if (!ok) return;

    setMessage('');
    const { error } = await supabase.from('rounds').delete().eq('id', id);
    if (error) setMessage('❌ Lỗi xóa: ' + error.message);
    else setMessage('🗑️ Đã xóa round!');

    const nextPage = page > 1 && rounds.length === 1 ? page - 1 : page;
    await loadRounds(nextPage);
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">🔄 Quản lý Round</h2>
        <div className="text-sm text-gray-600">
          {loading ? 'Đang tải…' : `Tổng: ${total} | Trang ${page}/${totalPages}`}
        </div>
      </header>

      {message && (
        <div className="rounded-xl border bg-green-50 text-green-700 px-4 py-3">{message}</div>
      )}

      {/* ===== CREATE multi-project ===== */}
      <section className="bg-white border rounded-2xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-lg">➕ Tạo Round (chọn nhiều Project)</h3>

        {/* Filters for project picker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-600">Lọc nhanh theo Project</label>
            <select
              className={INPUT}
              value={createProjectFilterId}
              onChange={(e) => setCreateProjectFilterId(e.target.value)}
            >
              <option value="">— Tất cả Project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-gray-600">Tìm project theo tên</label>
            <input
              className={INPUT}
              placeholder="Gõ để lọc danh sách project…"
              value={createProjectSearch}
              onChange={(e) => setCreateProjectSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Selected count + actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-gray-700">
            Đã chọn: <b>{selectedProjectIds.size}</b> project
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => toggleSelectAllVisibleProjects(createVisibleProjects)}
              disabled={createVisibleProjects.length === 0}
            >
              Chọn/Bỏ chọn (theo danh sách đang lọc)
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={clearSelectedProjects}
              disabled={selectedProjectIds.size === 0}
            >
              Xóa chọn
            </button>
          </div>
        </div>

        {/* Project checklist */}
        <div className="max-h-60 overflow-auto border rounded-xl p-3 bg-gray-50">
          {createVisibleProjects.length === 0 ? (
            <div className="text-sm text-gray-500">Không có project phù hợp bộ lọc.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {createVisibleProjects.map((p) => {
                const checked = selectedProjectIds.has(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white"
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleProject(p.id)} />
                    <span className="text-sm">{p.title}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Create options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoNumber}
                onChange={(e) => setAutoNumber(e.target.checked)}
              />
              <span>Tự động số vòng (max + 1 theo từng project)</span>
            </label>

            {!autoNumber && (
              <div>
                <label className="text-sm text-gray-600">Số vòng (thủ công)</label>
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  value={manualNumber}
                  onChange={(e) => setManualNumber(Math.max(1, Number(e.target.value || 1)))}
                />
              </div>
            )}

            <div>
              <label className="text-sm text-gray-600">Trạng thái</label>
              <select
                className={INPUT}
                value={createStatus}
                onChange={(e) => setCreateStatus(e.target.value as any)}
              >
                {ROUND_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Ngày mở (open_at) (tuỳ chọn)</label>
              <input
                className={INPUT}
                type="datetime-local"
                value={createOpenAt}
                onChange={(e) => setCreateOpenAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Ngày đóng (close_at) (tuỳ chọn)</label>
              <input
                className={INPUT}
                type="datetime-local"
                value={createCloseAt}
                onChange={(e) => setCreateCloseAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-600">Mô tả (description)</label>
          <textarea
            className={INPUT}
            rows={3}
            placeholder="Nhập mô tả cho round (hướng dẫn, thời gian, ...)"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
          />
        </div>

        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={createRoundsForSelectedProjects}
          disabled={creating || selectedProjectIds.size === 0}
        >
          {creating ? 'Đang tạo…' : '➕ Tạo Round cho các Project đã chọn'}
        </button>
      </section>

      {/* ===== FILTERS (LIST) ===== */}
      <section className="bg-white border rounded-2xl p-5 space-y-3 shadow-sm">
        <h3 className="font-semibold text-lg">🔎 Bộ lọc danh sách Round</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-sm text-gray-600">Project</label>
            <select
              className={INPUT}
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
            >
              <option value="">— Tất cả Project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">Trạng thái</label>
            <select className={INPUT} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">— Tất cả —</option>
              {ROUND_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">Ngày tạo từ</label>
            <input className={INPUT} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-gray-600">Ngày tạo đến</label>
            <input className={INPUT} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="md:col-span-4 flex gap-2">
            <button
              className={BTN_SECONDARY}
              type="button"
              onClick={() => {
                setFilterProjectId('');
                setFilterStatus('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Reset lọc
            </button>
          </div>
        </div>
      </section>

      {/* ===== LIST ===== */}
      <section className="bg-white border rounded-2xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-lg">📋 Danh sách Round</h3>

          <div className="flex items-center gap-2">
            <button
              className={BTN_SECONDARY}
              disabled={page <= 1 || loading}
              onClick={() => loadRounds(page - 1)}
              type="button"
            >
              ◀ Trang trước
            </button>
            <button
              className={BTN_SECONDARY}
              disabled={page >= totalPages || loading}
              onClick={() => loadRounds(page + 1)}
              type="button"
            >
              Trang sau ▶
            </button>
          </div>
        </div>

        {loading ? (
          <div>Đang tải...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm bg-white">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border text-left">Project</th>
                  <th className="p-2 border text-left">Số vòng</th>
                  <th className="p-2 border text-left">Trạng thái</th>
                  <th className="p-2 border text-left">Ngày mở</th>
                  <th className="p-2 border text-left">Ngày đóng</th>
                  <th className="p-2 border text-left">Mô tả</th>
                  <th className="p-2 border text-left">Ngày tạo</th>
                  <th className="p-2 border text-left">Thao tác</th>
                </tr>
              </thead>

              <tbody>
                {rounds.map((r) => {
                  const d =
                    drafts[r.id] ?? {
                      round_number: r.round_number,
                      status: r.status,
                      description: r.description ?? '',
                      open_at: formatLocalDT(r.open_at),
                      close_at: formatLocalDT(r.close_at),
                    };

                  const dirty =
                    Number(d.round_number) !== r.round_number ||
                    d.status !== r.status ||
                    (d.description ?? '') !== (r.description ?? '') ||
                    (d.open_at ?? '') !== formatLocalDT(r.open_at) ||
                    (d.close_at ?? '') !== formatLocalDT(r.close_at);

                  return (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-2 border min-w-[260px]">
                        <div className="font-medium">{projectTitleById.get(r.project_id) ?? r.project_id}</div>
                        <div className="text-xs text-gray-500 font-mono">{r.project_id}</div>
                      </td>

                      <td className="p-2 border min-w-[110px]">
                        <input
                          className={INPUT}
                          type="number"
                          min={1}
                          value={d.round_number}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [r.id]: { ...d, round_number: Math.max(1, Number(e.target.value || 1)) },
                            }))
                          }
                        />
                      </td>

                      <td className="p-2 border min-w-[200px]">
                        <div className="mb-2">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${statusPillClass(r.status)}`}>
                            {viRoundStatus(r.status)}
                          </span>
                        </div>

                        <select
                          className={INPUT}
                          value={d.status}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [r.id]: { ...d, status: e.target.value },
                            }))
                          }
                        >
                          {ROUND_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-2 border min-w-[210px]">
                        <input
                          className={INPUT}
                          type="datetime-local"
                          value={d.open_at}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [r.id]: { ...d, open_at: e.target.value },
                            }))
                          }
                        />
                      </td>

                      <td className="p-2 border min-w-[210px]">
                        <input
                          className={INPUT}
                          type="datetime-local"
                          value={d.close_at}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [r.id]: { ...d, close_at: e.target.value },
                            }))
                          }
                        />
                      </td>

                      <td className="p-2 border min-w-[340px]">
                        <textarea
                          className={INPUT}
                          rows={2}
                          value={d.description}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [r.id]: { ...d, description: e.target.value },
                            }))
                          }
                        />
                        {dirty && <div className="text-xs text-amber-700 mt-1">* Có thay đổi chưa lưu</div>}
                      </td>

                      <td className="p-2 border whitespace-nowrap text-gray-700">
                        {new Date(r.created_at).toLocaleString()}
                      </td>

                      <td className="p-2 border whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            className={BTN_PRIMARY}
                            disabled={!dirty || savingId === r.id}
                            onClick={() => updateRound(r.id)}
                            type="button"
                          >
                            {savingId === r.id ? 'Đang cập nhật…' : 'Cập nhật'}
                          </button>

                          <button className={BTN_DANGER} onClick={() => deleteRound(r.id)} type="button">
                            🗑️ Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {rounds.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-gray-500">
                      Không có round phù hợp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
