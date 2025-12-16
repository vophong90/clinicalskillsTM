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

type Project = { id: string; title: string; created_at?: string };

const INPUT =
  'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN_PRIMARY =
  'inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-gray-800 hover:bg-gray-200 disabled:opacity-50';
const BTN_DANGER =
  'inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50';

const ROUND_PAGE_SIZE = 10;
const PROJECT_PICKER_PAGE_SIZE = 10;

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

function fmtMaybeDT(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/** ✅ Normalize để tìm kiếm ổn định với Unicode + dấu ngoặc */
function normalizeText(s: string) {
  return (s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ✅ Match "lỏng": gõ "nội" vẫn match "(nội bộ)" */
function includesLoose(haystack: string, needle: string) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return false;
  if (h.includes(n)) return true;
  if (h.includes('(' + n)) return true;
  return false;
}

export default function AdminRoundManager() {
  // ===== DATA =====
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundTotal, setRoundTotal] = useState(0);

  // ===== UI =====
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [message, setMessage] = useState('');

  // ===== PAGINATION (ROUND LIST) =====
  const [roundPage, setRoundPage] = useState(1);
  const roundTotalPages = useMemo(
    () => Math.max(1, Math.ceil(roundTotal / ROUND_PAGE_SIZE)),
    [roundTotal]
  );

  // ===== FILTERS (ROUND LIST) =====
  const [filterProjectKeyword, setFilterProjectKeyword] = useState<string>(''); // ✅ dùng keyword để lọc rounds
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [roundDateFrom, setRoundDateFrom] = useState<string>(''); // created_at from
  const [roundDateTo, setRoundDateTo] = useState<string>(''); // created_at to

  // ===== CREATE (multi-project) =====
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set()
  );
  const [autoNumber, setAutoNumber] = useState(true);
  const [manualNumber, setManualNumber] = useState(1);

  const CREATE_DEFAULT_STATUS: 'draft' = 'draft';

  const [createOpenAt, setCreateOpenAt] = useState<string>(''); // datetime-local
  const [createCloseAt, setCreateCloseAt] = useState<string>(''); // datetime-local
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // ===== PROJECT PICKER (CREATE) FILTER + PAGINATION =====
  const [projectSearch, setProjectSearch] = useState<string>('');
  const [projectCreatedFrom, setProjectCreatedFrom] = useState<string>(''); // YYYY-MM-DD
  const [projectCreatedTo, setProjectCreatedTo] = useState<string>(''); // YYYY-MM-DD
  const [projectPage, setProjectPage] = useState(1);

  // ===== DRAFTS (ROUND LIST) =====
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        round_number: number;
        status: string;
        description: string;
        open_at: string; // datetime-local
        close_at: string; // datetime-local
      }
    >
  >({});
  const [savingId, setSavingId] = useState('');

  // ===== MODAL EDIT =====
  const [editingId, setEditingId] = useState<string>(''); // round id
  const [editForm, setEditForm] = useState<{
    round_number: number;
    status: string;
    description: string;
    open_at: string;
    close_at: string;
  } | null>(null);

  const editingRound = useMemo(() => {
    if (!editingId) return null;
    return rounds.find((r) => r.id === editingId) ?? null;
  }, [editingId, rounds]);

  // ===== helpers =====
  const projectTitleById = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.title));
    return m;
  }, [projects]);

  /** ✅ keyword -> matched project_ids để filter rounds */
  const matchedProjectIdsForKeyword = useMemo(() => {
    const kw = filterProjectKeyword.trim();
    if (!kw) return null; // null = không áp filter
    const ids = projects
      .filter((p) => includesLoose(p.title, kw))
      .map((p) => p.id);
    return ids;
  }, [projects, filterProjectKeyword]);

  // ===== LOAD =====
  useEffect(() => {
    loadProjects();
    // rounds sẽ được load sau khi có projects để keyword filter hoạt động đúng
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // khi projects đã load xong hoặc filter đổi => reload rounds
  useEffect(() => {
    loadRounds(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, filterProjectKeyword, filterStatus, roundDateFrom, roundDateTo]);

  useEffect(() => {
    setProjectPage(1);
  }, [projectSearch, projectCreatedFrom, projectCreatedTo]);

  async function loadProjects() {
    setLoadingProjects(true);
    setMessage('');

    const { data, error } = await supabase
      .from('projects')
      .select('id, title, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setProjects([]);
      setMessage('❌ Lỗi tải projects: ' + error.message);
      setLoadingProjects(false);
      return;
    }

    setProjects((data as Project[]) ?? []);
    setLoadingProjects(false);
  }

  async function loadRounds(nextPage: number) {
    setLoadingRounds(true);
    setMessage('');

    const from = (nextPage - 1) * ROUND_PAGE_SIZE;
    const to = from + ROUND_PAGE_SIZE - 1;

    // ✅ Nếu đang có keyword nhưng chưa load projects xong -> tạm chưa query
    const kw = filterProjectKeyword.trim();
    if (kw && loadingProjects) {
      setRounds([]);
      setRoundTotal(0);
      setRoundPage(1);
      setLoadingRounds(false);
      return;
    }

    // ✅ Nếu có keyword và không match project nào -> list rỗng luôn (khỏi query rounds)
    if (kw && matchedProjectIdsForKeyword && matchedProjectIdsForKeyword.length === 0) {
      setRounds([]);
      setRoundTotal(0);
      setRoundPage(1);
      setLoadingRounds(false);
      return;
    }

    let q = supabase
      .from('rounds')
      .select(
        'id, project_id, round_number, status, description, open_at, close_at, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // ✅ keyword filter -> rounds.project_id IN (matched project ids)
    if (kw && matchedProjectIdsForKeyword && matchedProjectIdsForKeyword.length > 0) {
      q = q.in('project_id', matchedProjectIdsForKeyword);
    }

    if (filterStatus) q = q.eq('status', filterStatus);
    if (roundDateFrom) q = q.gte('created_at', toStartOfDayISO(roundDateFrom));
    if (roundDateTo) q = q.lt('created_at', toNextDayStartISO(roundDateTo));

    const { data, error, count } = await q.range(from, to);

    if (error) {
      setRounds([]);
      setRoundTotal(0);
      setMessage('❌ Lỗi tải rounds: ' + error.message);
      setLoadingRounds(false);
      return;
    }

    const rows = (data as Round[]) ?? [];
    setRounds(rows);
    setRoundTotal(count ?? 0);
    setRoundPage(nextPage);

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

    setLoadingRounds(false);
  }

  // ===== Project picker derived list (CREATE section) =====
  const filteredProjects = useMemo(() => {
    let list = projects;

    const kw2 = projectSearch.trim().toLowerCase();
    if (kw2) {
      list = list.filter((p) => p.title.toLowerCase().includes(kw2));
    }

    if (projectCreatedFrom) {
      const fromISO = toStartOfDayISO(projectCreatedFrom);
      list = list.filter((p) => (p.created_at ? p.created_at >= fromISO : true));
    }
    if (projectCreatedTo) {
      const toISO = toNextDayStartISO(projectCreatedTo);
      list = list.filter((p) => (p.created_at ? p.created_at < toISO : true));
    }

    return list;
  }, [projects, projectSearch, projectCreatedFrom, projectCreatedTo]);

  const projectTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredProjects.length / PROJECT_PICKER_PAGE_SIZE));
  }, [filteredProjects.length]);

  const projectPageItems = useMemo(() => {
    const start = (projectPage - 1) * PROJECT_PICKER_PAGE_SIZE;
    return filteredProjects.slice(start, start + PROJECT_PICKER_PAGE_SIZE);
  }, [filteredProjects, projectPage]);

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
      const allVisibleSelected =
        visible.length > 0 && visible.every((p) => prev.has(p.id));
      const next = new Set(prev);

      if (allVisibleSelected) {
        visible.forEach((p) => next.delete(p.id));
      } else {
        visible.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  // ===== CREATE multi =====
  async function createRoundsForSelectedProjects() {
    setMessage('');
    if (selectedProjectIds.size === 0) {
      setMessage('❌ Vui lòng chọn ít nhất 1 Project.');
      return;
    }

    const ok = window.confirm(
      autoNumber
        ? `Tạo round cho ${selectedProjectIds.size} project (số vòng tự động: max+1 theo từng project)? Trạng thái mặc định: Bản nháp.`
        : `Tạo round #${manualNumber} cho ${selectedProjectIds.size} project? Trạng thái mặc định: Bản nháp.`
    );
    if (!ok) return;

    setCreating(true);
    try {
      const selectedIds = Array.from(selectedProjectIds);

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

      const open_at = createOpenAt ? parseLocalDT(createOpenAt) : null;
      const close_at = createCloseAt ? parseLocalDT(createCloseAt) : null;

      const inserts = selectedIds.map((pid) => ({
        project_id: pid,
        round_number: nextNumberByProject.get(pid) ?? 1,
        status: CREATE_DEFAULT_STATUS,
        description: createDescription.trim() ? createDescription.trim() : null,
        open_at,
        close_at,
      }));

      const { error } = await supabase.from('rounds').insert(inserts);
      if (error) throw error;

      setMessage(`✅ Đã tạo round (Bản nháp) cho ${selectedIds.length} project.`);
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
  async function updateRound(id: string, nextDraft?: (typeof drafts)[string]) {
    setMessage('');
    const d = nextDraft ?? drafts[id];
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
      await loadRounds(roundPage);
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

    const nextPage = roundPage > 1 && rounds.length === 1 ? roundPage - 1 : roundPage;
    await loadRounds(nextPage);
  }

  // ===== modal helpers =====
  function openEditModal(roundId: string) {
    const r = rounds.find((x) => x.id === roundId);
    if (!r) return;

    const base = drafts[roundId] ?? {
      round_number: r.round_number,
      status: r.status,
      description: r.description ?? '',
      open_at: formatLocalDT(r.open_at),
      close_at: formatLocalDT(r.close_at),
    };

    setEditForm({ ...base });
    setEditingId(roundId);
  }

  function closeEditModal() {
    setEditingId('');
    setEditForm(null);
  }

  async function saveEditModal() {
    if (!editingId || !editForm) return;

    const nextDraft = {
      round_number: Math.max(1, Number(editForm.round_number || 1)),
      status: editForm.status,
      description: editForm.description ?? '',
      open_at: editForm.open_at ?? '',
      close_at: editForm.close_at ?? '',
    };

    setDrafts((prev) => ({ ...prev, [editingId]: nextDraft }));
    await updateRound(editingId, nextDraft);
    closeEditModal();
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">🔄 Quản lý Round</h2>
        <div className="text-sm text-gray-600">
          {loadingRounds ? 'Đang tải…' : `Tổng: ${roundTotal} | Trang ${roundPage}/${roundTotalPages}`}
        </div>
      </header>

      {message && <div className="rounded-xl border bg-green-50 text-green-700 px-4 py-3">{message}</div>}

      {/* ===== CREATE multi-project ===== */}
      <section className="bg-white border rounded-2xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-lg">➕ Tạo Round (chọn nhiều Project)</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="text-sm text-gray-600">Tìm project theo tên</label>
            <input
              className={INPUT}
              placeholder="Gõ để lọc theo tên project…"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Ngày tạo project từ</label>
            <input
              className={INPUT}
              type="date"
              value={projectCreatedFrom}
              onChange={(e) => setProjectCreatedFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Ngày tạo project đến</label>
            <input
              className={INPUT}
              type="date"
              value={projectCreatedTo}
              onChange={(e) => setProjectCreatedTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-gray-700">
            Đã chọn: <b>{selectedProjectIds.size}</b> project
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => toggleSelectAllVisibleProjects(projectPageItems)}
              disabled={projectPageItems.length === 0}
            >
              Chọn tất cả
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={clearSelectedProjects}
              disabled={selectedProjectIds.size === 0}
            >
              Bỏ chọn tất cả
            </button>
          </div>
        </div>

        <div className="border rounded-xl p-3 bg-gray-50">
          {loadingProjects ? (
            <div className="text-sm text-gray-500">Đang tải project…</div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-sm text-gray-500">Không có project phù hợp bộ lọc.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {projectPageItems.map((p) => {
                  const checked = selectedProjectIds.has(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white">
                      <input type="checkbox" checked={checked} onChange={() => toggleProject(p.id)} />
                      <span className="text-sm">{p.title}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-3 text-sm text-gray-700">
                <div>
                  Tổng: <b>{filteredProjects.length}</b> | Trang <b>{projectPage}</b>/{projectTotalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={BTN_SECONDARY}
                    type="button"
                    disabled={projectPage <= 1}
                    onClick={() => setProjectPage((p) => Math.max(1, p - 1))}
                  >
                    ◀ Trước
                  </button>
                  <button
                    className={BTN_SECONDARY}
                    type="button"
                    disabled={projectPage >= projectTotalPages}
                    onClick={() => setProjectPage((p) => Math.min(projectTotalPages, p + 1))}
                  >
                    Sau ▶
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoNumber} onChange={(e) => setAutoNumber(e.target.checked)} />
              <span>Tự động số vòng</span>
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

            <div className="text-sm text-gray-700">
              Trạng thái mặc định: <b>Bản nháp</b>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-600">Ngày mở</label>
              <input
                className={INPUT}
                type="datetime-local"
                value={createOpenAt}
                onChange={(e) => setCreateOpenAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Ngày đóng</label>
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
          <label className="text-sm text-gray-600">Mô tả</label>
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

      {/* ===== FILTERS (ROUND LIST) ===== */}
      <section className="bg-white border rounded-2xl p-5 space-y-3 shadow-sm">
        <h3 className="font-semibold text-lg">🔎 Bộ lọc danh sách Round</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          {/* ✅ Project keyword filter (no dropdown) */}
          <div className="md:col-span-1">
            <label className="text-sm text-gray-600">Project</label>
            <input
              className={INPUT}
              placeholder="Gõ từ khóa tên project để lọc round… (vd: nội)"
              value={filterProjectKeyword}
              onChange={(e) => setFilterProjectKeyword(e.target.value)}
            />
            {!!filterProjectKeyword.trim() && !loadingProjects && matchedProjectIdsForKeyword && (
              <div className="mt-1 text-xs text-gray-600">
                Match: <b>{matchedProjectIdsForKeyword.length}</b> project
              </div>
            )}
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
            <input className={INPUT} type="date" value={roundDateFrom} onChange={(e) => setRoundDateFrom(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-gray-600">Ngày tạo đến</label>
            <input className={INPUT} type="date" value={roundDateTo} onChange={(e) => setRoundDateTo(e.target.value)} />
          </div>

          <div className="md:col-span-4 flex gap-2">
            <button
              className={BTN_SECONDARY}
              type="button"
              onClick={() => {
                setFilterProjectKeyword('');
                setFilterStatus('');
                setRoundDateFrom('');
                setRoundDateTo('');
              }}
            >
              Reset lọc
            </button>
          </div>
        </div>
      </section>

      {/* ===== ROUND LIST (ROW CARDS) ===== */}
      <section className="bg-white border rounded-2xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-lg">📋 Danh sách Round</h3>

          <div className="flex items-center gap-2">
            <button className={BTN_SECONDARY} disabled={roundPage <= 1 || loadingRounds} onClick={() => loadRounds(roundPage - 1)} type="button">
              ◀ Trang trước
            </button>
            <button className={BTN_SECONDARY} disabled={roundPage >= roundTotalPages || loadingRounds} onClick={() => loadRounds(roundPage + 1)} type="button">
              Trang sau ▶
            </button>
          </div>
        </div>

        {loadingRounds ? (
          <div>Đang tải...</div>
        ) : (
          <div className="space-y-2">
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

              const projectTitle = projectTitleById.get(r.project_id) ?? '(Không rõ project)';

              return (
                <div
                  key={r.id}
                  className="border rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="font-semibold truncate">{projectTitle}</div>

                      <span className="text-gray-400">•</span>

                      <div className="text-sm text-gray-800 whitespace-nowrap">
                        Vòng <b>{r.round_number}</b>
                      </div>

                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${statusPillClass(r.status)} whitespace-nowrap`}
                        title={viRoundStatus(r.status)}
                      >
                        {viRoundStatus(r.status)}
                      </span>

                      {dirty && <span className="text-xs text-amber-700 whitespace-nowrap">* Chưa lưu</span>}
                    </div>

                    <div className="mt-1 text-xs text-gray-600 truncate">
                      Mở: {fmtMaybeDT(r.open_at)} &nbsp;|&nbsp; Đóng: {fmtMaybeDT(r.close_at)} &nbsp;|&nbsp; Tạo: {fmtMaybeDT(r.created_at)}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button type="button" className={BTN_SECONDARY} onClick={() => openEditModal(r.id)}>
                      Sửa
                    </button>
                    <button type="button" className={BTN_DANGER} onClick={() => deleteRound(r.id)}>
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })}

            {rounds.length === 0 && (
              <div className="p-4 text-center text-gray-500 border rounded-xl bg-gray-50">
                Không có round phù hợp bộ lọc.
              </div>
            )}

            <div className="mt-2 flex items-center justify-between text-sm text-gray-700">
              <div>
                Tổng: <b>{roundTotal}</b> | Trang <b>{roundPage}</b>/{roundTotalPages}
              </div>
              <div className="flex items-center gap-2">
                <button className={BTN_SECONDARY} disabled={roundPage <= 1} onClick={() => loadRounds(roundPage - 1)} type="button">
                  ◀ Trang trước
                </button>
                <button className={BTN_SECONDARY} disabled={roundPage >= roundTotalPages} onClick={() => loadRounds(roundPage + 1)} type="button">
                  Trang sau ▶
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===== EDIT MODAL ===== */}
      {editingId && editForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEditModal();
          }}
        >
          <div className="absolute inset-0 bg-black/40" />

          <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-xl border">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-gray-500">Chỉnh sửa Round</div>
                <div className="font-semibold truncate">
                  {editingRound
                    ? `${projectTitleById.get(editingRound.project_id) ?? '(Không rõ project)'} • Vòng ${editingRound.round_number}`
                    : '—'}
                </div>
              </div>

              <button type="button" className={BTN_SECONDARY} onClick={closeEditModal}>
                Đóng
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Số vòng</label>
                  <input
                    className={INPUT}
                    type="number"
                    min={1}
                    value={editForm.round_number}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, round_number: Math.max(1, Number(e.target.value || 1)) } : prev
                      )
                    }
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Trạng thái</label>
                  <select
                    className={INPUT}
                    value={editForm.status}
                    onChange={(e) => setEditForm((prev) => (prev ? { ...prev, status: e.target.value } : prev))}
                  >
                    {ROUND_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Ngày mở</label>
                  <input
                    className={INPUT}
                    type="datetime-local"
                    value={editForm.open_at}
                    onChange={(e) => setEditForm((prev) => (prev ? { ...prev, open_at: e.target.value } : prev))}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Ngày đóng</label>
                  <input
                    className={INPUT}
                    type="datetime-local"
                    value={editForm.close_at}
                    onChange={(e) => setEditForm((prev) => (prev ? { ...prev, close_at: e.target.value } : prev))}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600">Mô tả</label>
                <textarea
                  className={INPUT}
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                />
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={closeEditModal}>
                Hủy
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={saveEditModal} disabled={savingId === editingId}>
                {savingId === editingId ? 'Đang cập nhật…' : 'Cập nhật'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
