'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Round = {
  id: string;
  project_id: string;
  round_number: number;
  status: string;
};

type Project = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  rounds: Round[];
};

// Dữ liệu API progress (khuyến nghị API aggregate đúng 1 user x 1 round)
type ProgressRow = {
  user_id: string;
  user_name: string;
  email: string;

  project_id: string;
  project_title: string;

  round_id: string;
  round_number: number;

  is_submitted: boolean;
  updated_at: string | null;

  // optional (nếu API có trả)
  submitted_items?: number;
  total_items?: number;
  invited_at?: string | null;
  last_email_sent_at?: string | null;
};

const UI = {
  page: 'space-y-6 max-w-full overflow-x-hidden',
  h1: 'text-xl font-bold mb-2',
  muted: 'text-sm text-slate-500',
  card: 'border rounded-lg p-4 bg-white space-y-3 overflow-hidden',
  cardSoft: 'border rounded-lg p-4 bg-gray-50 space-y-3 overflow-hidden',
  input: 'w-full border rounded px-2 py-1 text-sm',
  select: 'w-full border rounded px-2 py-1 text-sm bg-white',
  btn:
    'px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50',
  btn2:
    'px-3 py-2 rounded-lg border border-slate-300 font-semibold text-sm hover:bg-slate-50 disabled:opacity-50',
  badge: 'text-xs px-2 py-1 rounded bg-slate-100 text-slate-700',
};

export default function AdminSurveyProgressManager() {
  // ====== projects + rounds ======
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [errorProjects, setErrorProjects] = useState<string | null>(null);

  // ====== filter bar giống trang tổng hợp ý kiến ======
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | string>(
    'all'
  );
  const [createdFrom, setCreatedFrom] = useState<string>('');
  const [createdTo, setCreatedTo] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');

  // ====== selection giống trang tổng hợp ý kiến ======
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedRoundId, setSelectedRoundId] = useState<string>('');

  // ====== progress filter ======
  const [status, setStatus] = useState<'all' | 'submitted' | 'not_submitted'>(
    'all'
  );
  const [q, setQ] = useState('');

  // ====== progress data ======
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [msg, setMsg] = useState<string>('');

  // ====== load projects + rounds (giống trang ý kiến: build Project[] có rounds[]) ======
  useEffect(() => {
    const loadProjects = async () => {
      setLoadingProjects(true);
      setErrorProjects(null);

      try {
        const { data: projectsData, error: projErr } = await supabase
          .from('projects')
          .select('id, title, status, created_at');

        if (projErr) throw new Error('Lỗi truy vấn projects: ' + projErr.message);

        const projectIds = (projectsData || []).map((p: any) => p.id);
        if (projectIds.length === 0) {
          setProjects([]);
          setLoadingProjects(false);
          return;
        }

        const { data: roundsData, error: roundErr } = await supabase
          .from('rounds')
          .select('id, project_id, round_number, status')
          .in('project_id', projectIds);

        if (roundErr) throw new Error('Lỗi truy vấn rounds: ' + roundErr.message);

        const projMap: Record<string, Project> = {};
        (projectsData || []).forEach((p: any) => {
          projMap[p.id] = {
            id: p.id,
            title: p.title,
            status: p.status,
            created_at: p.created_at,
            rounds: [],
          };
        });

        (roundsData || []).forEach((r: any) => {
          const p = projMap[r.project_id];
          if (p) {
            p.rounds.push({
              id: r.id,
              project_id: r.project_id,
              round_number: r.round_number,
              status: r.status,
            });
          }
        });

        const list = Object.values(projMap).sort((a, b) =>
          a.title.localeCompare(b.title)
        );
        setProjects(list);

        // auto-select project đầu tiên (giống trang ý kiến)
        if (!selectedProjectId && list.length > 0) {
          setSelectedProjectId(list[0].id);
        }
      } catch (e: any) {
        setErrorProjects(e?.message || String(e));
      } finally {
        setLoadingProjects(false);
      }
    };

    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== derived options =====
  const projectStatusOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status))).sort(),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    let list = [...projects];

    // 1) status
    if (projectStatusFilter !== 'all') {
      list = list.filter((p) => p.status === projectStatusFilter);
    }

    // 2) date from/to
    if (createdFrom) {
      const fromDate = new Date(createdFrom);
      list = list.filter((p) => {
        const d = new Date(p.created_at);
        return !Number.isNaN(d.getTime()) && d >= fromDate;
      });
    }

    if (createdTo) {
      const toDate = new Date(createdTo);
      const toDateEnd = new Date(toDate);
      toDateEnd.setDate(toDateEnd.getDate() + 1);

      list = list.filter((p) => {
        const d = new Date(p.created_at);
        return !Number.isNaN(d.getTime()) && d < toDateEnd;
      });
    }

    // 3) search title
    const k = searchText.trim().toLowerCase();
    if (k) {
      list = list.filter((p) => p.title.toLowerCase().includes(k));
    }

    // ưu tiên project mới tạo gần đây
    list.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return list;
  }, [projects, projectStatusFilter, createdFrom, createdTo, searchText]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const roundsOfSelectedProject = useMemo(() => {
    if (!selectedProject) return [];
    return [...selectedProject.rounds].sort((a, b) => a.round_number - b.round_number);
  }, [selectedProject]);

  // ===== handlers giống trang ý kiến =====
  const handleProjectRowClick = (id: string) => {
    setSelectedProjectId(id);
    setSelectedRoundId('');
    setRows([]);
    setMsg('');
  };

  const handleRoundChange = (id: string) => {
    setSelectedRoundId(id);
    setRows([]);
    setMsg('');
  };

  // ===== load progress (call API, tránh join client-side sai field) =====
  async function loadProgress() {
    setLoadingProgress(true);
    setMsg('');

    try {
      if (!selectedProjectId) {
        setRows([]);
        setMsg('Vui lòng chọn Project.');
        return;
      }
      if (!selectedRoundId) {
        setRows([]);
        setMsg('Vui lòng chọn Vòng để xem tiến độ.');
        return;
      }

      const params = new URLSearchParams();
      params.set('project_id', selectedProjectId);
      params.set('round_id', selectedRoundId);
      if (status !== 'all') params.set('status', status);
      if (q.trim()) params.set('q', q.trim());

      const res = await fetch('/api/surveys/progress?' + params.toString(), {
        method: 'GET',
      });

      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || 'Request failed');

      const items = (d.items || []) as any[];

      const mapped: ProgressRow[] = items.map((x) => ({
        user_id: x.user_id,
        user_name: x.user_name ?? x.name ?? '',
        email: x.email ?? '',

        project_id: x.project_id,
        project_title: x.project_title ?? x.title ?? '',

        round_id: x.round_id,
        round_number: x.round_number ?? x.round_no ?? 0,

        is_submitted: !!x.is_submitted,
        updated_at: x.updated_at ?? null,

        submitted_items: typeof x.submitted_items === 'number' ? x.submitted_items : undefined,
        total_items: typeof x.total_items === 'number' ? x.total_items : undefined,

        invited_at: x.invited_at ?? null,
        last_email_sent_at: x.last_email_sent_at ?? x.last_sent_at ?? null,
      }));

      setRows(mapped);

      if (mapped.length === 0) {
        setMsg('Không có dữ liệu tiến độ cho vòng này (hoặc chưa có participants/responses).');
      }
    } catch (e: any) {
      setRows([]);
      setMsg('❌ Lỗi tải tiến độ: ' + (e?.message || String(e)));
    } finally {
      setLoadingProgress(false);
    }
  }

  // auto reload khi đổi round/status (q thì để lọc client-side, tránh spam API)
  useEffect(() => {
    if (!selectedProjectId || !selectedRoundId) {
      setRows([]);
      return;
    }
    loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, selectedRoundId, status]);

  // ===== client-side filter dự phòng (q/status) =====
  const viewRows = useMemo(() => {
    const k = q.trim().toLowerCase();
    let out = rows;

    if (k) {
      out = out.filter(
        (r) =>
          (r.user_name || '').toLowerCase().includes(k) ||
          (r.email || '').toLowerCase().includes(k)
      );
    }

    if (status === 'submitted') out = out.filter((r) => r.is_submitted);
    if (status === 'not_submitted') out = out.filter((r) => !r.is_submitted);

    return out;
  }, [rows, q, status]);

  const summary = useMemo(() => {
    const total = viewRows.length;
    const submitted = viewRows.filter((x) => x.is_submitted).length;
    const notSubmitted = total - submitted;
    return { total, submitted, notSubmitted };
  }, [viewRows]);

  return (
    <div className={UI.page}>
      <h1 className={UI.h1}>📊 Theo dõi tiến độ khảo sát</h1>

      {/* 1) BỘ LỌC PROJECT (giống trang tổng hợp ý kiến) */}
      <section className={UI.cardSoft}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Tìm theo tên Project</label>
            <input
              type="text"
              className={UI.input}
              placeholder="Nhập một phần tên Project..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Trạng thái Project</label>
            <select
              className={UI.select}
              value={projectStatusFilter}
              onChange={(e) => setProjectStatusFilter(e.target.value as any)}
            >
              <option value="all">Tất cả</option>
              {projectStatusOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="block text-sm font-semibold">Ngày tạo Project</label>
            <div className="flex gap-2">
              <input
                type="date"
                className="border rounded px-2 py-1 text-xs w-1/2"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
              <input
                type="date"
                className="border rounded px-2 py-1 text-xs w-1/2"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-end justify-end">
            <button
              type="button"
              className={UI.btn2}
              onClick={() => {
                setProjectStatusFilter('all');
                setCreatedFrom('');
                setCreatedTo('');
                setSearchText('');
              }}
              disabled={loadingProjects}
            >
              Reset lọc
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-600 mt-1">
          <span>
            Tổng Project: <b>{projects.length}</b> · Sau lọc: <b>{filteredProjects.length}</b>
          </span>
          {loadingProjects && (
            <span className="text-gray-500">Đang tải project / vòng…</span>
          )}
          {errorProjects && <span className="text-red-600">{errorProjects}</span>}
        </div>
      </section>

      {/* 2) BẢNG PROJECT SAU LỌC + CHỌN VÒNG */}
      <section className={UI.card}>
        <h2 className="font-semibold mb-2">Chọn Project & Vòng để xem tiến độ</h2>

        {filteredProjects.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            Không có Project nào phù hợp bộ lọc.
          </div>
        ) : (
          <div className="border rounded max-h-72 overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="border px-2 py-1 text-center w-10">#</th>
                  <th className="border px-2 py-1 text-left">Tên Project</th>
                  <th className="border px-2 py-1 text-center w-24">Trạng thái</th>
                  <th className="border px-2 py-1 text-center w-32">Ngày tạo</th>
                  <th className="border px-2 py-1 text-center w-24">Số vòng</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p, idx) => {
                  const isSelected = p.id === selectedProjectId;
                  return (
                    <tr
                      key={p.id}
                      className={
                        'cursor-pointer hover:bg-blue-50 ' +
                        (isSelected ? 'bg-blue-50' : '')
                      }
                      onClick={() => handleProjectRowClick(p.id)}
                    >
                      <td className="border px-2 py-1 text-center align-top">{idx + 1}</td>
                      <td className="border px-2 py-1 align-top">
                        <div className="font-semibold">{p.title}</div>
                      </td>
                      <td className="border px-2 py-1 text-center align-top">{p.status}</td>
                      <td className="border px-2 py-1 text-center align-top">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="border px-2 py-1 text-center align-top">{p.rounds.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Project đang chọn</label>
            <div className="text-sm">
              {selectedProject ? selectedProject.title : 'Chưa chọn. Hãy click một Project trong bảng.'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Vòng</label>
            <select
              className={UI.select}
              value={selectedRoundId}
              onChange={(e) => handleRoundChange(e.target.value)}
              disabled={!selectedProject}
            >
              <option value="">-- Chọn vòng --</option>
              {roundsOfSelectedProject.map((r) => (
                <option key={r.id} value={r.id}>
                  Vòng {r.round_number} ({r.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="button"
              className={UI.btn}
              disabled={!selectedProjectId || !selectedRoundId || loadingProgress || loadingProjects}
              onClick={loadProgress}
            >
              {loadingProgress ? 'Đang tải tiến độ…' : 'Tải tiến độ'}
            </button>
          </div>
        </div>

        {!!msg && (
          <div className="mt-2 p-3 rounded bg-yellow-50 text-yellow-800 text-sm">
            {msg}
          </div>
        )}
      </section>

      {/* 3) FILTER + BẢNG TIẾN ĐỘ */}
      <section className={UI.card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">Tiến độ khảo sát</div>
            <div className={UI.muted}>
              Lọc theo trạng thái nộp & tìm theo tên/email. (Dữ liệu lấy từ API progress)
            </div>
          </div>
          <div className={UI.badge}>
            Tổng: {summary.total} · Đã nộp: {summary.submitted} · Chưa nộp: {summary.notSubmitted}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Trạng thái</label>
            <select
              className={UI.select}
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              disabled={!selectedRoundId}
            >
              <option value="all">— Tất cả —</option>
              <option value="submitted">Đã nộp</option>
              <option value="not_submitted">Chưa nộp</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1">Tìm (tên/email)</label>
            <input
              className={UI.input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nhập từ khoá..."
              disabled={!selectedRoundId}
            />
          </div>
        </div>

        <div className="mt-3 border rounded-lg overflow-auto max-h-[70vh]">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="p-2 text-left">Người tham gia</th>
                <th className="p-2 text-center">Project</th>
                <th className="p-2 text-center">Round</th>
                <th className="p-2 text-center">Tiến độ</th>
                <th className="p-2 text-center">Trạng thái</th>
                <th className="p-2 text-center">Cập nhật lần cuối</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.map((r) => {
                const progressText =
                  typeof r.submitted_items === 'number' && typeof r.total_items === 'number'
                    ? `${r.submitted_items}/${r.total_items}`
                    : '—';

                return (
                  <tr key={`${r.round_id}-${r.user_id}`} className="border-t">
                    <td className="p-2 text-left">
                      <b>{r.user_name || r.email}</b>{' '}
                      <span className="text-slate-500">({r.email})</span>
                    </td>
                    <td className="p-2 text-center">{r.project_title}</td>
                    <td className="p-2 text-center">V{r.round_number}</td>
                    <td className="p-2 text-center">{progressText}</td>
                    <td className="p-2 text-center">
                      {r.is_submitted ? (
                        <span className="px-2 py-1 rounded bg-green-100 text-green-700">Đã nộp</span>
                      ) : (
                        <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">Chưa nộp</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}

              {viewRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    {!selectedProjectId
                      ? 'Chọn Project để bắt đầu.'
                      : !selectedRoundId
                      ? 'Chọn Vòng để xem tiến độ.'
                      : loadingProgress
                      ? 'Đang tải…'
                      : 'Không có dữ liệu cho bộ lọc hiện tại.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-slate-500">
          Gợi ý: nếu API progress chưa hỗ trợ <code>q</code>/<code>status</code> server-side thì tab vẫn chạy nhờ lọc client-side.
        </div>
      </section>
    </div>
  );
}
