'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Project = { id: string; title: string; status: string };
type Round = { id: string; project_id: string; round_number: number };

// Tùy API / schema bạn đang dùng, mình để dạng "chuẩn tối thiểu" để render UI.
// Nếu API trả khác field name, bạn chỉ cần map lại ở đoạn `loadProgress()`.
type ProgressRow = {
  user_id: string;
  user_name: string;
  email: string;
  project_id: string;
  project_title: string;
  round_id: string;
  round_number: number;

  // trạng thái nộp
  is_submitted: boolean;
  updated_at: string | null; // thời điểm update response

  // optional: nếu bạn có bảng invitations/email_logs thì map thêm
  invited_at?: string | null;
  last_email_sent_at?: string | null;
};

const UI = {
  page: 'space-y-6',
  header: 'flex items-start justify-between gap-3',
  h1: 'text-2xl font-bold',
  muted: 'text-sm text-slate-500',
  card: 'border rounded-xl bg-white p-4 shadow-sm',
  titleRow: 'flex items-start justify-between gap-3',
  title: 'text-lg font-semibold',
  badge: 'text-xs px-2 py-1 rounded bg-slate-100 text-slate-700',
  input:
    'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200',
  select:
    'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200 bg-white',
  btn2:
    'px-4 py-2 rounded-lg font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
};

export default function AdminSurveyProgressManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);

  // filters
  const [projectId, setProjectId] = useState('');
  const [roundId, setRoundId] = useState('');
  const [status, setStatus] = useState<'all' | 'submitted' | 'not_submitted'>('all');
  const [q, setQ] = useState('');

  // data
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // load projects/rounds (tương tự các tab khác)
  useEffect(() => {
    (async () => {
      const [pr, rd] = await Promise.all([
        supabase.from('projects').select('id,title,status').order('title'),
        supabase.from('rounds').select('id,project_id,round_number').order('round_number'),
      ]);

      setProjects((pr.data as Project[]) || []);
      setRounds((rd.data as Round[]) || []);
    })();
  }, []);

  const roundsForProject = useMemo(() => {
    if (!projectId) return [];
    return rounds
      .filter((r) => r.project_id === projectId)
      .sort((a, b) => a.round_number - b.round_number);
  }, [rounds, projectId]);

  // ====== IMPORTANT: load progress ======
  // Mình assume bạn có (hoặc sẽ có) API trả về progress theo round/project.
  // Nếu bạn đã có API khác tên, đổi URL + mapping ở đây.
  async function loadProgress() {
    setLoading(true);
    setMsg('');
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      if (roundId) params.set('round_id', roundId);

      // status filter (optional server-side)
      if (status !== 'all') params.set('status', status);

      // search q (optional server-side)
      if (q.trim()) params.set('q', q.trim());

      const res = await fetch('/api/surveys/progress?' + params.toString(), {
        method: 'GET',
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);

      const items = (d.items || []) as any[];

      // Map an toàn về ProgressRow
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
        invited_at: x.invited_at ?? null,
        last_email_sent_at: x.last_email_sent_at ?? x.last_sent_at ?? null,
      }));

      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setMsg('❌ Lỗi tải tiến độ: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // Auto reload khi đổi project/round/status (giống pattern admin tab)
  useEffect(() => {
    // Nếu chưa chọn gì thì chưa cần load
    if (!projectId && !roundId) {
      setRows([]);
      return;
    }
    loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, roundId, status]);

  // Client-side filter q nếu API chưa hỗ trợ q
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

  // summary numbers
  const summary = useMemo(() => {
    const total = viewRows.length;
    const submitted = viewRows.filter((x) => x.is_submitted).length;
    const notSubmitted = total - submitted;
    return { total, submitted, notSubmitted };
  }, [viewRows]);

  return (
    <div className={UI.page}>
      <div className={UI.header}>
        <div>
          <h1 className={UI.h1}>📊 Theo dõi khảo sát</h1>
          <div className={UI.muted}>
            Theo dõi trạng thái nộp theo Project / Round, hỗ trợ lọc nhanh theo tên/email.
          </div>
        </div>

        <button className={UI.btn2} type="button" onClick={loadProgress} disabled={loading || (!projectId && !roundId)}>
          Làm mới
        </button>
      </div>

      {msg && <div className="p-3 rounded-lg bg-rose-50 text-rose-700">{msg}</div>}

      {/* Filters */}
      <div className={UI.card}>
        <div className={UI.titleRow}>
          <div>
            <div className={UI.title}>Bộ lọc</div>
            <div className={UI.muted}>Chọn Project trước, sau đó chọn Round (nếu cần).</div>
          </div>
          <div className={UI.badge}>
            Tổng: {summary.total} · Đã nộp: {summary.submitted} · Chưa nộp: {summary.notSubmitted}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Project</label>
            <select
              className={UI.select}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setRoundId('');
              }}
            >
              <option value="">— Chọn —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Round</label>
            <select
              className={UI.select}
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              disabled={!projectId}
            >
              <option value="">— Tất cả —</option>
              {roundsForProject.map((r) => (
                <option key={r.id} value={r.id}>
                  Vòng {r.round_number}
                </option>
              ))}
            </select>
            {!projectId && <div className="text-xs text-slate-400 mt-1">Chọn project trước.</div>}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Trạng thái</label>
            <select className={UI.select} value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="all">— Tất cả —</option>
              <option value="submitted">Đã nộp</option>
              <option value="not_submitted">Chưa nộp</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Tìm (tên/email)</label>
            <input
              className={UI.input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nhập từ khoá..."
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={UI.card}>
        <div className={UI.titleRow}>
          <div className={UI.title}>Danh sách tiến độ</div>
          <div className={UI.muted}>{loading ? 'Đang tải…' : `Hiển thị: ${viewRows.length} dòng`}</div>
        </div>

        <div className="mt-3 border rounded-lg overflow-auto max-h-[70vh]">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Người tham gia</th>
                <th className="p-2 text-center">Project</th>
                <th className="p-2 text-center">Round</th>
                <th className="p-2 text-center">Trạng thái</th>
                <th className="p-2 text-center">Cập nhật lần cuối</th>
                <th className="p-2 text-center">Email gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.map((r) => (
                <tr key={`${r.round_id}-${r.user_id}`} className="border-t">
                  <td className="p-2 text-left">
                    <b>{r.user_name || r.email}</b> <span className="text-slate-500">({r.email})</span>
                  </td>
                  <td className="p-2 text-center">{r.project_title}</td>
                  <td className="p-2 text-center">V{r.round_number}</td>
                  <td className="p-2 text-center">
                    {r.is_submitted ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-700">Đã nộp</span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">Chưa nộp</span>
                    )}
                  </td>
                  <td className="p-2 text-center">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</td>
                  <td className="p-2 text-center">
                    {r.last_email_sent_at ? new Date(r.last_email_sent_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}

              {viewRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    {!projectId && !roundId
                      ? 'Chọn Project hoặc Round để xem tiến độ.'
                      : loading
                      ? 'Đang tải…'
                      : 'Không có dữ liệu cho bộ lọc hiện tại.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-slate-500">
          Gợi ý: nếu API chưa hỗ trợ <code>q</code>/<code>status</code> server-side thì tab này vẫn chạy nhờ lọc client-side.
        </div>
      </div>
    </div>
  );
}
